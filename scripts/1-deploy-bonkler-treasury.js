'use strict';

// Imports.
import { ethers } from 'hardhat';

// These are the constants for the bidder contract.
const BONKLER_NFT = '0xABFaE8A54e6817F57F9De7796044E9a60e61ad67';

async function logTransactionGas (transaction) {
	let transactionReceipt = await transaction.wait();
	let transactionGasCost = transactionReceipt.gasUsed;
	console.log(` -> Gas cost: ${transactionGasCost.toString()}`);
	return transactionGasCost;
}

// Deploy using an Ethers signer to a network.
async function main () {
	const signers = await ethers.getSigners();
	const addresses = await Promise.all(
		signers.map(async signer => signer.getAddress())
	);
	const deployer = {
		provider: signers[0].provider,
		signer: signers[0],
		address: addresses[0]
	};
	console.log(`Deploying contracts from: ${deployer.address}`);

	// Retrieve the necessary contract factories.
	const BonklerTreasury = await ethers.getContractFactory('BonklerTreasury');

	// Create a variable to track the total gas cost of deployment.
	let totalGasCost = ethers.utils.parseEther('0');

	// Deploy the Bonklet item contract.
	const bonklerTreasury = await BonklerTreasury.connect(deployer.signer).deploy(
		BONKLER_NFT
	);
	let deployed = await bonklerTreasury.deployed();
	console.log('');
	console.log(`* Treasury deployed to: ${bonklerTreasury.address}`);
	totalGasCost = totalGasCost.add(
		await logTransactionGas(deployed.deployTransaction)
	);

	// Log a verification command.
	console.log(`[VERIFY] npx hardhat verify --network mainnet ${bonklerTreasury.address} "${BONKLER_NFT}"`);

	// Log the final gas cost of deployment.
	console.log('');
	console.log(`=> Final gas cost of deployment: ${totalGasCost.toString()}`);
}

// Execute the script and catch errors.
main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});
