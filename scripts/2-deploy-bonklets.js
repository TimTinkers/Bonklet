'use strict';

// Imports.
import { ethers } from 'hardhat';

// These are the constants for the item contract.
const BONKLET_NAME = 'BONKLET';
const BONKLET_SYMBOL = 'BNKLT';
const METADATA_URI = '';
const BONKLET_CAP = ethers.BigNumber.from('12800');

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
	const BonkletNFT = await ethers.getContractFactory('Bonklet');

	// Create a variable to track the total gas cost of deployment.
	let totalGasCost = ethers.utils.parseEther('0');

	// Deploy the Bonklet item contract.
	let bonklet = await BonkletNFT.connect(deployer.signer).deploy(
		BONKLET_NAME,
		BONKLET_SYMBOL,
		METADATA_URI,
		BONKLET_CAP
	);
	let bonkletDeployed = await bonklet.deployed();
	console.log('');
	console.log(`* Item collection deployed to: ${bonklet.address}`);
	totalGasCost = totalGasCost.add(
		await logTransactionGas(bonkletDeployed.deployTransaction)
	);

	// Log a verification command.
	console.log(`[VERIFY] npx hardhat verify --network mainnet ${bonklet.address} "${BONKLET_NAME}" "${BONKLET_SYMBOL}" "${METADATA_URI}" ${BONKLET_CAP}`);

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
