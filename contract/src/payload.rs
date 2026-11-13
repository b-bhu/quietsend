//! Minimal Solana legacy-message parser that binds a signing payload to
//! (recipient, amount, mint) for the one transaction shape quietsend builds in
//! Normal mode:
//!
//!   ix0: Associated Token Account program, CreateIdempotent
//!        accounts [payer, ata, owner=recipient, mint, system, token]
//!   ix1: SPL Token program, TransferChecked
//!        accounts [source, mint, dest=ata, authority=payer]
//!
//! The ATA program itself enforces ata == derive(owner, mint, token program), so
//! requiring ix1.dest == ix0.ata binds the destination owner to `recipient`
//! without deriving a PDA in the contract. Anything else is rejected.

pub const ATA_PROGRAM: &str = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
pub const TOKEN_PROGRAM: &str = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
pub const SYSTEM_PROGRAM: &str = "11111111111111111111111111111111";
pub const USDC_DECIMALS: u8 = 6;

pub type Key = [u8; 32];

pub fn decode_key(s: &str) -> Result<Key, String> {
    let v = bs58::decode(s).into_vec().map_err(|_| format!("not base58: {s}"))?;
    v.try_into().map_err(|_| format!("not a 32-byte key: {s}"))
}

fn read_cu16(b: &[u8], i: &mut usize) -> Option<usize> {
    let mut val = 0usize;
    for shift in 0..3 {
        let byte = *b.get(*i)?;
        *i += 1;
        val |= ((byte & 0x7f) as usize) << (7 * shift);
        if byte & 0x80 == 0 {
            return Some(val);
        }
    }
    None
}

struct Ix {
    program: usize,
    accounts: Vec<usize>,
    data: Vec<u8>,
}

struct Msg {
    keys: Vec<Key>,
    ixs: Vec<Ix>,
}

fn parse(b: &[u8]) -> Option<(u8, Msg)> {
    let mut i = 0usize;
    let num_sigs = *b.first()?;
    if num_sigs & 0x80 != 0 {
        return None; // versioned (v0) message: not supported in Normal mode
    }
    i += 3; // header
    let n_keys = read_cu16(b, &mut i)?;
    let mut keys = Vec::new();
    for _ in 0..n_keys {
        let k: Key = b.get(i..i + 32)?.try_into().ok()?;
        keys.push(k);
        i += 32;
    }
    i += 32; // recent blockhash
    if i > b.len() {
        return None;
    }
    let n_ix = read_cu16(b, &mut i)?;
    let mut ixs = Vec::new();
    for _ in 0..n_ix {
        let program = *b.get(i)? as usize;
        i += 1;
        let n_acc = read_cu16(b, &mut i)?;
        let accounts = b.get(i..i + n_acc)?.iter().map(|x| *x as usize).collect();
        i += n_acc;
        let n_data = read_cu16(b, &mut i)?;
        let data = b.get(i..i + n_data)?.to_vec();
        i += n_data;
        ixs.push(Ix { program, accounts, data });
    }
    if i != b.len() {
        return None; // trailing bytes
    }
    Some((num_sigs, Msg { keys, ixs }))
}

/// Ok(()) iff `msg` is exactly the Normal-mode USDC transfer shape for these values.
pub fn verify_normal_payload(msg: &[u8], recipient: &Key, amount: u64, mint: &Key) -> Result<(), String> {
    let (num_sigs, m) = parse(msg).ok_or("payload is not a legacy Solana message")?;
    if num_sigs != 1 {
        return Err("payload must have exactly one required signature".into());
    }
    if m.ixs.len() != 2 {
        return Err("payload must have exactly 2 instructions (create ATA idempotent, transfer checked)".into());
    }
    let key = |idx: usize| m.keys.get(idx).ok_or_else(|| "account index out of range".to_string());
    let ata_prog = decode_key(ATA_PROGRAM)?;
    let tok_prog = decode_key(TOKEN_PROGRAM)?;
    let sys_prog = decode_key(SYSTEM_PROGRAM)?;
    let fee_payer = key(0)?;

    let a = &m.ixs[0];
    if key(a.program)? != &ata_prog || a.data != [1u8] || a.accounts.len() != 6 {
        return Err("instruction 0 is not ATA CreateIdempotent".into());
    }
    let (payer, ata, owner, a_mint, sys, tok) = (
        key(a.accounts[0])?,
        key(a.accounts[1])?,
        key(a.accounts[2])?,
        key(a.accounts[3])?,
        key(a.accounts[4])?,
        key(a.accounts[5])?,
    );
    if payer != fee_payer || owner != recipient || a_mint != mint || sys != &sys_prog || tok != &tok_prog {
        return Err("ATA instruction accounts do not match the recipient, mint and signer".into());
    }

    let t = &m.ixs[1];
    if key(t.program)? != &tok_prog || t.data.len() != 10 || t.data[0] != 12 || t.accounts.len() != 4 {
        return Err("instruction 1 is not SPL Token TransferChecked".into());
    }
    let amt = u64::from_le_bytes(t.data[1..9].try_into().unwrap());
    if amt != amount {
        return Err(format!("payload amount {amt} does not match amount argument {amount}"));
    }
    if t.data[9] != USDC_DECIMALS {
        return Err("payload decimals are not 6".into());
    }
    let (t_mint, dest, authority) = (key(t.accounts[1])?, key(t.accounts[2])?, key(t.accounts[3])?);
    if t_mint != mint || dest != ata || authority != fee_payer {
        return Err("transfer mint, destination or authority do not match".into());
    }
    Ok(())
}

#[cfg(test)]
pub mod tests {
    use super::*;

    pub fn cu16(out: &mut Vec<u8>, mut v: usize) {
        loop {
            let b = (v & 0x7f) as u8;
            v >>= 7;
            if v == 0 {
                out.push(b);
                break;
            }
            out.push(b | 0x80);
        }
    }

    /// Build the Normal-mode message with caller-chosen values (for tests).
    pub fn build(sender: Key, recipient: Key, mint: Key, ata: Key, src: Key, amount: u64) -> Vec<u8> {
        let keys = vec![
            sender,
            ata,
            src,
            recipient,
            mint,
            decode_key(SYSTEM_PROGRAM).unwrap(),
            decode_key(TOKEN_PROGRAM).unwrap(),
            decode_key(ATA_PROGRAM).unwrap(),
        ];
        let mut b = vec![1, 0, 5];
        cu16(&mut b, keys.len());
        for k in &keys {
            b.extend_from_slice(k);
        }
        b.extend_from_slice(&[7u8; 32]);
        cu16(&mut b, 2);
        // ix0
        b.push(7);
        cu16(&mut b, 6);
        b.extend_from_slice(&[0, 1, 3, 4, 5, 6]);
        cu16(&mut b, 1);
        b.push(1);
        // ix1
        b.push(6);
        cu16(&mut b, 4);
        b.extend_from_slice(&[2, 4, 1, 0]);
        cu16(&mut b, 10);
        b.push(12);
        b.extend_from_slice(&amount.to_le_bytes());
        b.push(6);
        b
    }

    fn k(n: u8) -> Key {
        [n; 32]
    }

    #[test]
    fn accepts_exact_shape() {
        let m = build(k(10), k(11), k(12), k(13), k(14), 100_000);
        assert_eq!(verify_normal_payload(&m, &k(11), 100_000, &k(12)), Ok(()));
    }

    #[test]
    fn rejects_wrong_amount_recipient_mint() {
        let m = build(k(10), k(11), k(12), k(13), k(14), 100_000);
        assert!(verify_normal_payload(&m, &k(11), 100_001, &k(12)).is_err());
        assert!(verify_normal_payload(&m, &k(99), 100_000, &k(12)).is_err());
        assert!(verify_normal_payload(&m, &k(11), 100_000, &k(99)).is_err());
    }

    #[test]
    fn rejects_garbage_trailing_and_versioned() {
        let mut m = build(k(10), k(11), k(12), k(13), k(14), 5);
        m.push(0);
        assert!(verify_normal_payload(&m, &k(11), 5, &k(12)).is_err());
        let mut m = build(k(10), k(11), k(12), k(13), k(14), 5);
        m[0] = 0x80;
        assert!(verify_normal_payload(&m, &k(11), 5, &k(12)).is_err());
        assert!(verify_normal_payload(&[1, 2, 3], &k(11), 5, &k(12)).is_err());
    }

    #[test]
    fn rejects_extra_instruction_data_shape() {
        // authority != fee payer: swap authority index to the recipient account
        let mut m = build(k(10), k(11), k(12), k(13), k(14), 5);
        let n = m.len();
        // last ix data is 10 bytes, preceded by len(1), preceded by 4 account indices
        m[n - 10 - 1 - 1] = 3; // authority index -> recipient key
        assert!(verify_normal_payload(&m, &k(11), 5, &k(12)).is_err());
    }
}
