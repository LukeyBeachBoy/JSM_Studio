use std::io::Write;
use yaxpeax_arch::{Decoder, LengthedInstruction, U8Reader};
use yaxpeax_arm::armv7::{InstDecoder, Opcode, Operand};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let path = &args[1];
    let base: u64 = u64::from_str_radix(args[2].trim_start_matches("0x"), 16).unwrap();
    let skip: usize = if args.len() > 3 { args[3].parse().unwrap() } else { 32 };
    let data = std::fs::read(path).unwrap();
    let data = &data[skip..];
    let decoder = InstDecoder::default_thumb();
    let mut off: usize = 0;
    let stdout = std::io::stdout();
    let mut out = std::io::BufWriter::new(stdout.lock());
    while off + 2 <= data.len() {
        let mut reader = U8Reader::new(&data[off..]);
        let addr = base + off as u64;
        match decoder.decode(&mut reader) {
            Ok(inst) => {
                let len = inst.len().to_const() as usize;
                let bytes: String = data[off..off+len].iter().map(|b| format!("{:02x}", b)).collect::<Vec<_>>().join("");
                let mut text = format!("{}", inst);
                // annotate branch targets
                let mut target: Option<u64> = None;
                for op in inst.operands.iter() {
                    if let Operand::BranchThumbOffset(imm) = op {
                        let t = (addr as i64 + 4 + (*imm as i64) * 2) as u64;
                        target = Some(t);
                    } else if let Operand::BranchOffset(imm) = op {
                        let t = (addr as i64 + 4 + (*imm as i64) * 4) as u64;
                        target = Some(t);
                    }
                }
                if let Some(t) = target { text.push_str(&format!("   ; -> {:#x}", t)); }
                // annotate PC-relative loads
                if let Opcode::LDR = inst.opcode {
                    if let Some(Operand::RegDerefPreindexOffset(reg, imm, add, _)) = inst.operands.get(1) {
                        if reg.number() == 15 {
                            let pc = (addr + 4) & !3;
                            let ea = if *add { pc + *imm as u64 } else { pc - *imm as u64 };
                            let o = (ea - base) as usize;
                            if o + 4 <= data.len() {
                                let v = u32::from_le_bytes([data[o],data[o+1],data[o+2],data[o+3]]);
                                text.push_str(&format!("   ; [{:#x}] = {:#x}", ea, v));
                            }
                        }
                    }
                }
                writeln!(out, "{:08x}: {:<10} {}", addr, bytes, text).unwrap();
                off += len;
            }
            Err(_) => {
                let v = u16::from_le_bytes([data[off], data[off+1]]);
                writeln!(out, "{:08x}: {:04x}       .hword {:#x}", addr, v, v).unwrap();
                off += 2;
            }
        }
    }
}
