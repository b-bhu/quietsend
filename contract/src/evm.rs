//! EVM support: USDC "gasless" transfers (EIP-3009 transferWithAuthorization).
//!
//! The contract never parses an Ethereum transaction. It builds the EIP-712
//! digest itself from (from, to, value, validAfter, validBefore, nonce) for a
//! known USDC contract, and only that digest is sent to the MPC. So the
//! signature can only ever authorize "move exactly `value` USDC from `from` to
//! `to`" on that chain. Anyone (a relayer) may submit it and pay gas; the USDC
//! contract checks the signature recovers to `from` and burns the nonce.
//!
//! `from` comes from the caller. That is safe: the MPC signs with the caller's
//! own derived key, so an authorization naming any other `from` simply fails
//! signature recovery in the USDC contract.
use near_sdk::env::keccak256_array;

pub type Addr = [u8; 20];

pub struct EvmChain {
    pub name: &'static str,
    pub chain_id: u64,
    pub usdc: &'static str,
    pub usdc_name: &'static str,
    pub usdc_version: &'static str,
}

/// Every EVM chain the contract will sign for. Adding a chain is one entry.
pub const CHAINS: &[EvmChain] = &[EvmChain {
    name: "base-sepolia",
    chain_id: 84532,
    usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    usdc_name: "USDC",
    usdc_version: "2",
}];

pub fn chain(name: &str) -> Option<&'static EvmChain> {
    CHAINS.iter().find(|c| c.name == name)
}

/// "0x" + 40 hex chars, any case.
pub fn parse_addr(s: &str) -> Result<Addr, String> {
    let h = s.strip_prefix("0x").ok_or_else(|| format!("not a 0x address: {s}"))?;
    if h.len() != 40 {
        return Err(format!("not a 20-byte address: {s}"));
    }
    let mut out = [0u8; 20];
    for (i, o) in out.iter_mut().enumerate() {
        *o = u8::from_str_radix(&h[2 * i..2 * i + 2], 16).map_err(|_| format!("not hex: {s}"))?;
    }
    Ok(out)
}

pub fn addr_label(chain: &str, a: &Addr) -> String {
    let hex: String = a.iter().map(|b| format!("{b:02x}")).collect();
    format!("{chain}:0x{hex}")
}

fn word_addr(a: &Addr) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[12..].copy_from_slice(a);
    w
}

fn word_u128(v: u128) -> [u8; 32] {
    let mut w = [0u8; 32];
    w[16..].copy_from_slice(&v.to_be_bytes());
    w
}

pub fn domain_separator(c: &EvmChain) -> [u8; 32] {
    let typehash = keccak256_array(b"EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    let mut enc = Vec::with_capacity(32 * 5);
    enc.extend_from_slice(&typehash);
    enc.extend_from_slice(&keccak256_array(c.usdc_name.as_bytes()));
    enc.extend_from_slice(&keccak256_array(c.usdc_version.as_bytes()));
    enc.extend_from_slice(&word_u128(c.chain_id as u128));
    enc.extend_from_slice(&word_addr(&parse_addr(c.usdc).expect("valid chain table")));
    keccak256_array(&enc)
}

pub fn transfer_with_authorization_digest(
    c: &EvmChain,
    from: &Addr,
    to: &Addr,
    value: u128,
    valid_after: u64,
    valid_before: u64,
    nonce: &[u8; 32],
) -> [u8; 32] {
    let typehash = keccak256_array(
        b"TransferWithAuthorization(address from,address to,uint256 value,uint256 validAfter,uint256 validBefore,bytes32 nonce)",
    );
    let mut enc = Vec::with_capacity(32 * 7);
    enc.extend_from_slice(&typehash);
    enc.extend_from_slice(&word_addr(from));
    enc.extend_from_slice(&word_addr(to));
    enc.extend_from_slice(&word_u128(value));
    enc.extend_from_slice(&word_u128(valid_after as u128));
    enc.extend_from_slice(&word_u128(valid_before as u128));
    enc.extend_from_slice(nonce);
    let struct_hash = keccak256_array(&enc);
    let mut msg = Vec::with_capacity(66);
    msg.extend_from_slice(&[0x19, 0x01]);
    msg.extend_from_slice(&domain_separator(c));
    msg.extend_from_slice(&struct_hash);
    keccak256_array(&msg)
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn hex(b: &[u8]) -> String {
        b.iter().map(|x| format!("{x:02x}")).collect()
    }

    #[test]
    fn base_sepolia_domain_separator_matches_chain() {
        testing_env!(VMContextBuilder::new().build());
        // DOMAIN_SEPARATOR() read from 0x036C…CF7e on Base Sepolia, 14 Nov 2026
        assert_eq!(
            hex(&domain_separator(chain("base-sepolia").unwrap())),
            "71f17a3b2ff373b803d70a5a07c046c1a2bc8e89c09ef722fcb047abe94c9818"
        );
    }

    #[test]
    fn digest_matches_typescript() {
        testing_env!(VMContextBuilder::new().build());
        // test/evm.test.ts computes the same inputs with viem's hashTypedData.
        let d = transfer_with_authorization_digest(chain("base-sepolia").unwrap(), &[1; 20], &[2; 20], 10, 0, 100, &[7; 32]);
        assert_eq!(hex(&d), "2347ce9472d49c349823c3a1d0fb50c8f4d5a30f4b4b7dcc362baea4ae58514e");
    }

    #[test]
    fn digest_changes_with_every_field() {
        testing_env!(VMContextBuilder::new().build());
        let c = chain("base-sepolia").unwrap();
        let (a, b) = ([1u8; 20], [2u8; 20]);
        let base = transfer_with_authorization_digest(c, &a, &b, 10, 0, 100, &[7; 32]);
        assert_ne!(base, transfer_with_authorization_digest(c, &a, &b, 11, 0, 100, &[7; 32]));
        assert_ne!(base, transfer_with_authorization_digest(c, &a, &[3; 20], 10, 0, 100, &[7; 32]));
        assert_ne!(base, transfer_with_authorization_digest(c, &[3; 20], &b, 10, 0, 100, &[7; 32]));
        assert_ne!(base, transfer_with_authorization_digest(c, &a, &b, 10, 0, 101, &[7; 32]));
        assert_ne!(base, transfer_with_authorization_digest(c, &a, &b, 10, 0, 100, &[8; 32]));
    }

    #[test]
    fn addresses_parse_strictly() {
        assert!(parse_addr("0x036CbD53842c5426634e7929541eC2318f3dCF7e").is_ok());
        assert!(parse_addr("036CbD53842c5426634e7929541eC2318f3dCF7e").is_err());
        assert!(parse_addr("0x036CbD53842c5426634e7929541eC2318f3dCF7").is_err());
        assert!(parse_addr("0xzz6CbD53842c5426634e7929541eC2318f3dCF7e").is_err());
        assert_eq!(
            addr_label("base-sepolia", &parse_addr("0xABCDEF0000000000000000000000000000000001").unwrap()),
            "base-sepolia:0xabcdef0000000000000000000000000000000001"
        );
    }
}
