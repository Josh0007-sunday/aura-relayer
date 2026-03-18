const anchor = require('@project-serum/anchor');
const idl = require('../contracts/solana/idl.json');
const coder = new anchor.BorshCoder(idl);
try {
    const decoded = coder.events.decode('IVkvdVJ87vpXibjGuzEwdPZSO2dvVT5Mtze6xAAw/fUwcBtPnQSOyEBCDwAAAAAAKQAAAFNUMjJLSFgyVk5WR00zWTNDSzlRMEFIMk5WSzNSSDBNNkJaWlZEVkcwEgAAAGJ1cm4tMTc3Mzc2MDA3MzI3MQ==');
    console.log("Decoded:", decoded);
} catch (e) {
    console.error("Error:", e);
}
