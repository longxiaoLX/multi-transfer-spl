import { initializeKeypair } from "./initializeKeypair";
import * as web3 from "@solana/web3.js";
import * as token from '@solana/spl-token';
import fs from "fs";

function loadKeypair(jsonPath: string): web3.Keypair {
  return web3.Keypair.fromSecretKey(new Uint8Array(JSON.parse(fs.readFileSync(jsonPath).toString())));
}

async function createNewMint(
  connection: web3.Connection,
  payer: web3.Keypair,
  mintAuthority: web3.PublicKey,
  freezeAuthority: web3.PublicKey,
  decimals: number,
  mint: web3.Keypair,
): Promise<web3.PublicKey> {

  const tokenMint = await token.createMint(
    connection,
    payer,
    mintAuthority,
    freezeAuthority,
    decimals,
    mint,
  );

  return tokenMint;
}

async function createTokenAccount(
  connection: web3.Connection,
  payer: web3.Keypair,
  mint: web3.PublicKey,
  owner: web3.PublicKey
) {
  const tokenAccount = await token.getOrCreateAssociatedTokenAccount(
    connection,
    payer,
    mint,
    owner,
    undefined,
  )

  return tokenAccount
}

async function mintTokens(
  connection: web3.Connection,
  payer: web3.Keypair,
  mint: web3.PublicKey,
  destination: web3.PublicKey,
  authority: web3.Keypair,
  amount: number
) {
  const transactionSignature = await token.mintTo(
    connection,
    payer,
    mint,
    destination,
    authority,
    amount,
    undefined,
  )

  console.log(`The signature of tranction: ${transactionSignature}`);
}

async function createMultiTokenAccounts(
  connection: web3.Connection,
  mint: web3.PublicKey,
  payer: web3.Keypair,
): Promise<void> {
  const txInstructions: web3.TransactionInstruction[] = [];
  let toPubkey = web3.Keypair.generate().publicKey;
  let ata = token.getAssociatedTokenAddressSync(mint, toPubkey);
  txInstructions[0] = token.createAssociatedTokenAccountInstruction(payer.publicKey, ata, toPubkey, mint);
  const { blockhash } = await connection.getLatestBlockhash();
  const message = new web3.TransactionMessage({
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
    instructions: txInstructions,
  }).compileToLegacyMessage();
  const tranction = new web3.VersionedTransaction(message);
  tranction.sign([payer]);
  const sig = await connection.sendTransaction(tranction);
  console.log(`Signature: ${sig}`);

  const filePath = "/home/xiaolong/solana-learn/multi-transfer-spl/token-accounts-list.txt";

  // fs.readFile(filePath, "utf-8", (err, data) => {
  //   if (err) {
  //     console.error('Error reading file:', err);
  //     return;
  //   }
  //   const newData = data + ata.toString() + '\n';
  //   fs.writeFile(filePath, newData, 'utf8', (err) => {
  //     if (err) {
  //       console.error('Error writing file:', err);
  //       return;
  //     }
  //     console.log('File updated successfully!');
  //   });
  // });
}

// 一个 tx 最多可以打包 10 个
// commitment = "processed" 为 25 * 10 = 250
// 504 * 10 = 5040
// 将主 ata 分到其他中转 ata 20
// lookup
// 成功可以看前后 token 变化
async function mintTokensToMutipleAccounts(
  connection: web3.Connection,
  payer: web3.Keypair,
  payerAta: web3.PublicKey,
  mint: web3.PublicKey,
) {
  const { blockhash } = await connection.getLatestBlockhash();
  let counter = 0;
  const startTime = Date.now();

  while (true) {
    let currentTime = Date.now()
    // let tx = new web3.Transaction;
    let txIntucs: web3.TransactionInstruction[] = [];
    counter++;
    for (let index = 0; index < 10; index++) {
      let toPubkey = web3.Keypair.generate().publicKey;
      let ata = token.getAssociatedTokenAddressSync(mint, toPubkey);
      // tx.add(token.createAssociatedTokenAccountInstruction(payer.publicKey, ata, toPubkey, mint));
      // tx.add(token.createTransferInstruction(payerAta, ata, payer.publicKey, 100));
      txIntucs[2 * index] = token.createAssociatedTokenAccountInstruction(payer.publicKey, ata, toPubkey, mint);
      txIntucs[2 * index + 1] = token.createTransferInstruction(payerAta, ata, payer.publicKey, 100);
    }

    // let sig = await web3.sendAndConfirmTransaction(connection, tx, [payer], { commitment: "processed" });
    const message = new web3.TransactionMessage({
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
      instructions: txIntucs,
    }).compileToLegacyMessage();
    const tranction = new web3.VersionedTransaction(message);
    tranction.sign([payer]);

    const sig = await connection.sendTransaction(tranction);
    console.log(`${counter}-Signature: ${sig}`);
    if (currentTime - startTime >= 10000) { break }
  }
}

async function main() {
  const connection = new web3.Connection("http://127.0.0.1:8899")
  const mintKeypair = loadKeypair("/home/xiaolong/solana-learn/multi-transfer-spl/keypairs/mint.json");
  const sender = loadKeypair("/home/xiaolong/.config/solana/id.json");

  const mint = await createNewMint(
    connection,
    sender,
    sender.publicKey,
    sender.publicKey,
    2,
    mintKeypair,
  )

  // const mintInfo = await token.getMint(connection, mintKeypair.publicKey);

  // console.log(`Mint address: ${mintInfo.address}`);

  const tokenAccount = await createTokenAccount(
    connection,
    sender,
    mintKeypair.publicKey,
    sender.publicKey,
  )

  // console.log(`User token account: ${tokenAccount.address}`);
  // const tokenAccount = new web3.PublicKey("4ETMYoWwZH7STtoWJxM6pTeWCBvima2ycSCvYVzUxfbv");

  await mintTokens(
    connection,
    sender,
    mintKeypair.publicKey,
    tokenAccount.address,
    sender,
    1000000 * (10 ** 2)
  )

  // 批量产生要发送对象的代币账户
  await createMultiTokenAccounts(connection, mintKeypair.publicKey, sender);

  // await mintTokensToMutipleAccounts(connection, sender, tokenAccount, mintKeypair.publicKey);
}

main()
  .then(() => {
    console.log("Finished successfully")
    process.exit(0)
  })
  .catch((error) => {
    console.log(error)
    process.exit(1)
  })
