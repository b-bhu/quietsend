//! quietsend policy contract (NEAR testnet, near-sdk 5.x).
//!
//! A user (the predecessor account) sets limits for an agent. The agent holds only
//! a function-call key restricted to `sign_for_caller`. The contract checks the
//! limits, builds the derivation path itself (`<predecessor>/solana-1`), pays the
//! signer's 1 yoctoNEAR from the user's prepaid balance, and returns the MPC
//! signature. Over-limit sends are stored as intents the user must approve.
//!
//! Payload binding: in `normal` mode the contract parses the Solana message and
//! requires it to be exactly (create-ATA-idempotent, SPL TransferChecked) for the
//! given recipient, amount and USDC mint (see payload.rs). `hide_recipient` mode
//! sends a MagicBlock v0 transaction the contract cannot parse, so it is rejected
//! unless the user opts in with `allow_hide_unverified` (amount/recipient are then
//! NOT bound to the payload).
pub mod payload;

use near_sdk::json_types::{U128, U64};
use near_sdk::serde_json::{json, Value};
use near_sdk::store::LookupMap;
use near_sdk::{
    assert_one_yocto, env, near, require, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue,
};

pub const PATH_SUFFIX: &str = "solana-1";
pub const DOMAIN_ID: u32 = 1; // Ed25519 on v1.signer-prod.testnet
pub const DAY_NS: u64 = 86_400_000_000_000;
pub const APPROVAL_TTL_NS: u64 = DAY_NS; // an approval can be used within 24h
pub const MAX_PENDING: u32 = 20;
pub const MAX_ALLOWLIST: usize = 50;
const CALLBACK_GAS: Gas = Gas::from_tgas(15);
const RESERVE_GAS: Gas = Gas::from_tgas(10);
const MAX_SIGN_GAS: Gas = Gas::from_tgas(100);
const MIN_SIGN_GAS: Gas = Gas::from_tgas(20); // signer requires >= 15 (live config)

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Policy {
    /// Max USDC (6 decimals) the agent may send alone in one transfer.
    pub per_transfer: U128,
    /// Max USDC the agent may send alone per UTC day.
    pub daily: U128,
    /// Hard ceiling for any single transfer, even if the owner approves it.
    pub cap: U128,
    /// Allowed recipient Solana addresses. Empty = any recipient.
    pub allowlist: Vec<String>,
    /// Opt in to sign hide_recipient payloads the contract cannot verify.
    pub allow_hide_unverified: bool,
    pub spent_today: U128,
    pub day: u64,
    pub pending: u32,
}

#[near(serializers = [borsh, json])]
#[derive(Clone, Debug, PartialEq)]
pub struct Intent {
    pub user: AccountId,
    pub recipient: String,
    pub amount: U128,
    pub mode: String,
    pub reason: String,
    pub created_ns: U64,
    /// Set when the user approves; valid for APPROVAL_TTL_NS, usable once.
    pub approved_ns: Option<U64>,
}

#[near(serializers = [json])]
#[derive(Debug, PartialEq)]
#[serde(tag = "status", rename_all = "snake_case")]
pub enum SignResult {
    Signed { signature: Value, path: String, spent_today: U128 },
    NeedsApproval { intent_id: U64, reason: String },
    Rejected { reason: String },
}

#[derive(Debug, PartialEq)]
pub enum Decision {
    Allow,
    NeedsApproval(String),
    Reject(String),
}

/// Pure limit logic (unit tested). `spent` is today's spend so far.
pub fn evaluate(p: &Policy, spent: u128, amount: u128, recipient: &str) -> Decision {
    if amount == 0 {
        return Decision::Reject("amount must be greater than 0".into());
    }
    if amount > p.cap.0 {
        return Decision::Reject(format!("amount {amount} is above the hard cap {}", p.cap.0));
    }
    if amount > p.per_transfer.0 {
        return Decision::NeedsApproval(format!("amount {amount} is above per_transfer {}", p.per_transfer.0));
    }
    if spent.saturating_add(amount) > p.daily.0 {
        return Decision::NeedsApproval(format!("daily limit {} would be exceeded (spent {spent})", p.daily.0));
    }
    if !p.allowlist.is_empty() && !p.allowlist.iter().any(|r| r == recipient) {
        return Decision::NeedsApproval("recipient is not on the allowlist".into());
    }
    Decision::Allow
}

fn intent_key(user: &AccountId, recipient: &str, amount: u128, mode: &str) -> String {
    format!("{user}|{recipient}|{amount}|{mode}")
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct Contract {
    owner: AccountId,
    mpc: AccountId,
    usdc_mint: String,
    prepaid: LookupMap<AccountId, u128>,
    policies: LookupMap<AccountId, Policy>,
    intents: LookupMap<u64, Intent>,
    intent_index: LookupMap<String, u64>,
    next_intent: u64,
}

#[near]
impl Contract {
    #[init]
    pub fn new(owner: AccountId, mpc: AccountId, usdc_mint: String) -> Self {
        payload::decode_key(&usdc_mint).unwrap_or_else(|e| env::panic_str(&e));
        Self {
            owner,
            mpc,
            usdc_mint,
            prepaid: LookupMap::new(b"b".to_vec()),
            policies: LookupMap::new(b"p".to_vec()),
            intents: LookupMap::new(b"i".to_vec()),
            intent_index: LookupMap::new(b"x".to_vec()),
            next_intent: 1,
        }
    }

    /// Owner only: point at a different MPC signer contract.
    #[payable]
    pub fn set_mpc(&mut self, mpc: AccountId) {
        assert_one_yocto();
        require!(env::predecessor_account_id() == self.owner, "owner only");
        self.mpc = mpc;
    }

    /// Prepay yoctoNEAR the contract later attaches (1 per signature) for the caller.
    #[payable]
    pub fn deposit(&mut self) {
        let user = env::predecessor_account_id();
        let add = env::attached_deposit().as_yoctonear();
        require!(add > 0, "attach NEAR to deposit");
        let cur = self.prepaid.get(&user).copied().unwrap_or(0);
        self.prepaid.insert(user, cur + add);
    }

    /// Withdraw unused prepaid balance back to the caller.
    #[payable]
    pub fn withdraw(&mut self, amount: U128) -> Promise {
        assert_one_yocto();
        let user = env::predecessor_account_id();
        let cur = self.prepaid.get(&user).copied().unwrap_or(0);
        require!(amount.0 > 0 && amount.0 <= cur, "insufficient prepaid balance");
        self.prepaid.insert(user.clone(), cur - amount.0);
        Promise::new(user).transfer(NearToken::from_yoctonear(amount.0))
    }

    /// The caller sets their own policy. Needs 1 yoctoNEAR, so an agent's
    /// function-call key (which cannot attach a deposit) can never change it.
    #[payable]
    pub fn set_policy(
        &mut self,
        per_transfer: U128,
        daily: U128,
        cap: U128,
        allowlist: Option<Vec<String>>,
        allow_hide_unverified: Option<bool>,
    ) {
        assert_one_yocto();
        let user = env::predecessor_account_id();
        let allowlist = allowlist.unwrap_or_default();
        require!(cap.0 > 0, "cap must be > 0");
        require!(per_transfer.0 <= cap.0, "per_transfer must be <= cap");
        require!(allowlist.len() <= MAX_ALLOWLIST, "allowlist too long");
        for r in &allowlist {
            payload::decode_key(r).unwrap_or_else(|e| env::panic_str(&e));
        }
        let (spent_today, day, pending) = match self.policies.get(&user) {
            Some(old) => (old.spent_today, old.day, old.pending),
            None => (U128(0), 0, 0),
        };
        self.policies.insert(
            user,
            Policy {
                per_transfer,
                daily,
                cap,
                allowlist,
                allow_hide_unverified: allow_hide_unverified.unwrap_or(false),
                spent_today,
                day,
                pending,
            },
        );
    }

    /// The caller (agent, via function-call key, 0 deposit) asks for a signature.
    /// `payload_hex` is the Solana message bytes to sign. `amount` is in USDC base units.
    pub fn sign_for_caller(
        &mut self,
        payload_hex: String,
        recipient: String,
        amount: U128,
        mode: String,
    ) -> PromiseOrValue<SignResult> {
        let user = env::predecessor_account_id();
        macro_rules! reject {
            ($($t:tt)*) => {
                return PromiseOrValue::Value(SignResult::Rejected { reason: format!($($t)*) })
            };
        }
        let Some(mut policy) = self.policies.get(&user).cloned() else {
            reject!("no policy set for {user}; call set_policy first")
        };
        if mode != "normal" && mode != "hide_recipient" {
            reject!("mode must be normal or hide_recipient")
        }
        let payload_hex = payload_hex.to_lowercase();
        let Ok(bytes) = hex_decode(&payload_hex) else { reject!("payload_hex is not hex") };
        if bytes.len() < 32 || bytes.len() > 1232 {
            reject!("payload must be 32..1232 bytes")
        }
        let Ok(recipient_key) = payload::decode_key(&recipient) else {
            reject!("recipient is not a Solana address")
        };
        if mode == "normal" {
            let mint = payload::decode_key(&self.usdc_mint).unwrap();
            let Ok(amount64) = u64::try_from(amount.0) else { reject!("amount too large") };
            if let Err(e) = payload::verify_normal_payload(&bytes, &recipient_key, amount64, &mint) {
                reject!("payload binding failed: {e}")
            }
        } else if !policy.allow_hide_unverified {
            reject!("hide_recipient payloads cannot be verified on-chain; enable allow_hide_unverified to allow")
        }

        let prepaid = self.prepaid.get(&user).copied().unwrap_or(0);
        if prepaid < 1 {
            reject!("prepaid balance is empty; call deposit")
        }

        let now = env::block_timestamp();
        let today = now / DAY_NS;
        let spent = if policy.day == today { policy.spent_today.0 } else { 0 };
        let decision = evaluate(&policy, spent, amount.0, &recipient);
        if let Decision::Reject(r) = decision {
            reject!("{r}")
        }

        // An approved, unexpired intent for exactly this send passes once.
        let key = intent_key(&user, &recipient, amount.0, &mode);
        let mut consumed: Option<Intent> = None;
        if let Some(id) = self.intent_index.get(&key).copied() {
            if let Some(intent) = self.intents.get(&id).cloned() {
                match intent.approved_ns {
                    Some(at) if now <= at.0.saturating_add(APPROVAL_TTL_NS) => {
                        self.remove_intent(id, &key, &mut policy);
                        consumed = Some(intent);
                    }
                    Some(_) => {
                        // approval expired: drop it and treat this as a fresh request
                        self.remove_intent(id, &key, &mut policy);
                    }
                    None => {
                        if let Decision::NeedsApproval(_) = decision {
                            self.policies.insert(user, policy);
                            return PromiseOrValue::Value(SignResult::NeedsApproval {
                                intent_id: U64(id),
                                reason: intent.reason,
                            });
                        }
                        // limits now allow it (e.g. new day): ignore the stale pending intent
                    }
                }
            }
        }

        if consumed.is_none() {
            if let Decision::NeedsApproval(reason) = decision {
                if policy.pending >= MAX_PENDING {
                    self.policies.insert(user, policy);
                    reject!("too many pending intents; cancel some first")
                }
                let id = self.next_intent;
                self.next_intent += 1;
                self.intents.insert(
                    id,
                    Intent {
                        user: user.clone(),
                        recipient,
                        amount,
                        mode,
                        reason: reason.clone(),
                        created_ns: U64(now),
                        approved_ns: None,
                    },
                );
                self.intent_index.insert(key, id);
                policy.pending += 1;
                self.policies.insert(user, policy);
                return PromiseOrValue::Value(SignResult::NeedsApproval { intent_id: U64(id), reason });
            }
        }

        // Allowed (or approved). Reserve spend and the 1 yocto before the async call.
        let remaining = env::prepaid_gas().as_gas().saturating_sub(env::used_gas().as_gas());
        let overhead = (CALLBACK_GAS.as_gas()) + RESERVE_GAS.as_gas();
        if remaining < overhead + MIN_SIGN_GAS.as_gas() {
            self.policies.insert(user, policy);
            reject!("attach more gas (use at least 100 Tgas)")
        }
        let sign_gas = Gas::from_gas((remaining - overhead).min(MAX_SIGN_GAS.as_gas()));
        policy.day = today;
        policy.spent_today = U128(spent + amount.0);
        self.policies.insert(user.clone(), policy.clone());
        self.prepaid.insert(user.clone(), prepaid - 1);

        let path = Self::path_for(&user);
        let args = json!({
            "request": { "path": path, "payload_v2": { "Eddsa": payload_hex }, "domain_id": DOMAIN_ID }
        })
        .to_string()
        .into_bytes();

        PromiseOrValue::Promise(
            Promise::new(self.mpc.clone())
                .function_call("sign".to_string(), args, NearToken::from_yoctonear(1), sign_gas)
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(CALLBACK_GAS)
                        .on_signed(user, amount, today, spent + amount.0, consumed),
                ),
        )
    }

    #[private]
    pub fn on_signed(
        &mut self,
        user: AccountId,
        amount: U128,
        day: u64,
        spent_after: u128,
        consumed: Option<Intent>,
        #[callback_result] result: Result<Value, PromiseError>,
    ) -> SignResult {
        match result {
            Ok(signature) => SignResult::Signed {
                signature,
                path: Self::path_for(&user),
                spent_today: U128(spent_after),
            },
            Err(_) => {
                // Signer failed or timed out: refund the reservation.
                let cur = self.prepaid.get(&user).copied().unwrap_or(0);
                self.prepaid.insert(user.clone(), cur + 1);
                if let Some(mut p) = self.policies.get(&user).cloned() {
                    if p.day == day {
                        p.spent_today = U128(p.spent_today.0.saturating_sub(amount.0));
                    }
                    if let Some(i) = consumed {
                        let key = intent_key(&user, &i.recipient, i.amount.0, &i.mode);
                        if self.intent_index.get(&key).is_none() {
                            let id = self.next_intent;
                            self.next_intent += 1;
                            self.intents.insert(id, i);
                            self.intent_index.insert(key, id);
                            p.pending += 1;
                        }
                    }
                    self.policies.insert(user, p);
                }
                SignResult::Rejected { reason: "signer call failed; reservation refunded".into() }
            }
        }
    }

    /// The user approves a pending intent (1 yoctoNEAR, so an agent key cannot).
    #[payable]
    pub fn approve_intent(&mut self, id: U64) {
        assert_one_yocto();
        let user = env::predecessor_account_id();
        let mut intent = self.intents.get(&id.0).cloned().unwrap_or_else(|| env::panic_str("no such intent"));
        require!(intent.user == user, "not your intent");
        require!(intent.approved_ns.is_none(), "already approved");
        intent.approved_ns = Some(U64(env::block_timestamp()));
        self.intents.insert(id.0, intent);
    }

    /// The user deletes a pending or approved intent (1 yoctoNEAR).
    #[payable]
    pub fn cancel_intent(&mut self, id: U64) {
        assert_one_yocto();
        let user = env::predecessor_account_id();
        let intent = self.intents.get(&id.0).cloned().unwrap_or_else(|| env::panic_str("no such intent"));
        require!(intent.user == user, "not your intent");
        let key = intent_key(&user, &intent.recipient, intent.amount.0, &intent.mode);
        let mut p = self.policies.get(&user).cloned().unwrap_or_else(|| env::panic_str("no policy"));
        self.remove_intent(id.0, &key, &mut p);
        self.policies.insert(user, p);
    }

    // ---- views ----

    pub fn get_policy(&self, account_id: AccountId) -> Option<Policy> {
        self.policies.get(&account_id).cloned().map(|mut p| {
            if p.day != env::block_timestamp() / DAY_NS {
                p.spent_today = U128(0);
            }
            p
        })
    }

    pub fn get_intent(&self, id: U64) -> Option<Intent> {
        self.intents.get(&id.0).cloned()
    }

    pub fn get_prepaid(&self, account_id: AccountId) -> U128 {
        U128(self.prepaid.get(&account_id).copied().unwrap_or(0))
    }

    /// The MPC derivation path used for this account: `<account>/solana-1`.
    pub fn derived_path(&self, account_id: AccountId) -> String {
        Self::path_for(&account_id)
    }

    pub fn get_config(&self) -> Value {
        json!({ "owner": self.owner, "mpc": self.mpc, "usdc_mint": self.usdc_mint, "domain_id": DOMAIN_ID })
    }
}

impl Contract {
    fn path_for(user: &AccountId) -> String {
        format!("{user}/{PATH_SUFFIX}")
    }

    fn remove_intent(&mut self, id: u64, key: &str, policy: &mut Policy) {
        if self.intents.remove(&id).is_some() {
            policy.pending = policy.pending.saturating_sub(1);
        }
        self.intent_index.remove(&key.to_string());
    }
}

fn hex_decode(s: &str) -> Result<Vec<u8>, ()> {
    if s.len() % 2 != 0 {
        return Err(());
    }
    (0..s.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&s[i..i + 2], 16).map_err(|_| ()))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn pol(per: u128, daily: u128, cap: u128, allow: &[&str]) -> Policy {
        Policy {
            per_transfer: U128(per),
            daily: U128(daily),
            cap: U128(cap),
            allowlist: allow.iter().map(|s| s.to_string()).collect(),
            allow_hide_unverified: false,
            spent_today: U128(0),
            day: 0,
            pending: 0,
        }
    }

    #[test]
    fn limit_logic() {
        let p = pol(1_000_000, 3_000_000, 5_000_000, &[]);
        assert_eq!(evaluate(&p, 0, 100_000, "r"), Decision::Allow);
        assert_eq!(evaluate(&p, 0, 1_000_000, "r"), Decision::Allow);
        assert!(matches!(evaluate(&p, 0, 1_000_001, "r"), Decision::NeedsApproval(_)));
        assert!(matches!(evaluate(&p, 0, 5_000_001, "r"), Decision::Reject(_)));
        assert!(matches!(evaluate(&p, 0, 0, "r"), Decision::Reject(_)));
        // daily: 2.5 spent + 1 = 3.5 > 3
        assert!(matches!(evaluate(&p, 2_500_000, 1_000_000, "r"), Decision::NeedsApproval(_)));
        assert_eq!(evaluate(&p, 2_000_000, 1_000_000, "r"), Decision::Allow);
    }

    #[test]
    fn allowlist_logic() {
        let p = pol(1_000_000, 3_000_000, 5_000_000, &["good"]);
        assert_eq!(evaluate(&p, 0, 1, "good"), Decision::Allow);
        assert!(matches!(evaluate(&p, 0, 1, "other"), Decision::NeedsApproval(_)));
    }

    const MINT: &str = "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU";
    const REC: &str = "7iNJ7CLNT8UBPANxkkrsURjzaktbomCVa93N1sKcVo9C";

    fn ctx(pred: &str, deposit: u128, ts: u64) {
        testing_env!(VMContextBuilder::new()
            .predecessor_account_id(pred.parse().unwrap())
            .attached_deposit(NearToken::from_yoctonear(deposit))
            .block_timestamp(ts)
            .prepaid_gas(Gas::from_tgas(300))
            .build());
    }

    fn setup() -> Contract {
        ctx("owner.testnet", 0, 0);
        Contract::new("owner.testnet".parse().unwrap(), "v1.signer-prod.testnet".parse().unwrap(), MINT.into())
    }

    fn msg(amount: u64) -> String {
        let m = payload::tests::build(
            [10; 32],
            payload::decode_key(REC).unwrap(),
            payload::decode_key(MINT).unwrap(),
            [13; 32],
            [14; 32],
            amount,
        );
        m.iter().map(|b| format!("{b:02x}")).collect()
    }

    fn set(c: &mut Contract) {
        ctx("alice.testnet", 1, 5 * DAY_NS);
        c.set_policy(U128(1_000_000), U128(3_000_000), U128(5_000_000), None, None);
        ctx("alice.testnet", 1_000, 5 * DAY_NS);
        c.deposit();
    }

    fn result(r: PromiseOrValue<SignResult>) -> Option<SignResult> {
        match r {
            PromiseOrValue::Value(v) => Some(v),
            PromiseOrValue::Promise(_) => None,
        }
    }

    #[test]
    fn under_cap_creates_promise_and_reserves() {
        let mut c = setup();
        set(&mut c);
        ctx("alice.testnet", 0, 5 * DAY_NS);
        let r = c.sign_for_caller(msg(100_000), REC.into(), U128(100_000), "normal".into());
        assert!(result(r).is_none(), "expected a signer promise");
        assert_eq!(c.get_prepaid("alice.testnet".parse().unwrap()).0, 999);
        assert_eq!(c.get_policy("alice.testnet".parse().unwrap()).unwrap().spent_today.0, 100_000);
    }

    #[test]
    fn binding_mismatch_rejected() {
        let mut c = setup();
        set(&mut c);
        ctx("alice.testnet", 0, 5 * DAY_NS);
        // payload says 0.2, args say 0.1
        let r = result(c.sign_for_caller(msg(200_000), REC.into(), U128(100_000), "normal".into()));
        assert!(matches!(r, Some(SignResult::Rejected { .. })));
        assert_eq!(c.get_prepaid("alice.testnet".parse().unwrap()).0, 1000);
    }

    #[test]
    fn hide_mode_rejected_by_default() {
        let mut c = setup();
        set(&mut c);
        ctx("alice.testnet", 0, 5 * DAY_NS);
        let r = result(c.sign_for_caller(msg(100_000), REC.into(), U128(100_000), "hide_recipient".into()));
        assert!(matches!(r, Some(SignResult::Rejected { .. })));
    }

    #[test]
    fn no_policy_rejected() {
        let mut c = setup();
        ctx("bob.testnet", 0, 0);
        let r = result(c.sign_for_caller(msg(1), REC.into(), U128(1), "normal".into()));
        assert!(matches!(r, Some(SignResult::Rejected { .. })));
    }

    #[test]
    fn over_cap_intent_approve_once() {
        let mut c = setup();
        set(&mut c);
        ctx("alice.testnet", 0, 5 * DAY_NS);
        let first = result(c.sign_for_caller(msg(2_000_000), REC.into(), U128(2_000_000), "normal".into()));
        let Some(SignResult::NeedsApproval { intent_id, .. }) = first else { panic!("expected needs_approval") };
        // asking again returns the same intent, no duplicate
        let again = result(c.sign_for_caller(msg(2_000_000), REC.into(), U128(2_000_000), "normal".into()));
        assert_eq!(again, Some(SignResult::NeedsApproval { intent_id, reason: c.get_intent(intent_id).unwrap().reason }));
        assert_eq!(c.get_policy("alice.testnet".parse().unwrap()).unwrap().pending, 1);
        // unapproved => still no signature; prepaid untouched
        assert_eq!(c.get_prepaid("alice.testnet".parse().unwrap()).0, 1000);
        // owner approves
        ctx("alice.testnet", 1, 5 * DAY_NS + 10);
        c.approve_intent(intent_id);
        ctx("alice.testnet", 0, 5 * DAY_NS + 20);
        let r = c.sign_for_caller(msg(2_000_000), REC.into(), U128(2_000_000), "normal".into());
        assert!(result(r).is_none(), "approved intent should pass to the signer");
        assert!(c.get_intent(intent_id).is_none(), "intent consumed");
        // once only: the next identical request needs approval again
        let r = result(c.sign_for_caller(msg(2_000_000), REC.into(), U128(2_000_000), "normal".into()));
        assert!(matches!(r, Some(SignResult::NeedsApproval { .. })));
    }

    #[test]
    fn above_hard_cap_rejected() {
        let mut c = setup();
        set(&mut c);
        ctx("alice.testnet", 0, 5 * DAY_NS);
        let r = result(c.sign_for_caller(msg(6_000_000), REC.into(), U128(6_000_000), "normal".into()));
        assert!(matches!(r, Some(SignResult::Rejected { .. })));
    }

    #[test]
    fn daily_bucket_resets_next_day() {
        let mut c = setup();
        set(&mut c);
        for _ in 0..3 {
            ctx("alice.testnet", 0, 5 * DAY_NS + 5);
            assert!(result(c.sign_for_caller(msg(1_000_000), REC.into(), U128(1_000_000), "normal".into())).is_none());
        }
        // 4th today exceeds daily 3
        ctx("alice.testnet", 0, 5 * DAY_NS + 6);
        let r = result(c.sign_for_caller(msg(1_000_000), REC.into(), U128(1_000_000), "normal".into()));
        assert!(matches!(r, Some(SignResult::NeedsApproval { .. })));
        // next day it is allowed again
        ctx("alice.testnet", 0, 6 * DAY_NS + 1);
        assert!(result(c.sign_for_caller(msg(1_000_000), REC.into(), U128(1_000_000), "normal".into())).is_none());
    }

    #[test]
    #[should_panic(expected = "Requires attached deposit of exactly 1 yoctoNEAR")]
    fn set_policy_needs_one_yocto() {
        let mut c = setup();
        ctx("alice.testnet", 0, 0);
        c.set_policy(U128(1), U128(1), U128(1), None, None);
    }

    #[test]
    fn derived_path_uses_predecessor_account() {
        let c = setup();
        assert_eq!(c.derived_path("alice.testnet".parse().unwrap()), "alice.testnet/solana-1");
    }
}
