'use strict';

// Imports.
import { ethers } from 'hardhat';

// These are the constants for the bidder contract.
const BONKLER_AUCTION = '0xF421391011Dc77c0C2489d384C26e915Efd9e2C5';
const BONKLER_NFT = '0xABFaE8A54e6817F57F9De7796044E9a60e61ad67';
const BONKLER_TREASURY = '0xb92C17AB4AfBed8140b7bB09Fb7aae92b0EFe522';
const BONKLET_NFT = '0x68c51841b4dF39FB84f292cA26B76E7E2b4f1965';
const BONKLET_BIDDER_MINIMUM = ethers.BigNumber.from(
	ethers.utils.parseEther('0.1')
);
const BIDDER_LIMIT = 32;
const REDEMPTION_QUORUM = 60;

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
	const BonkletBidder = await ethers.getContractFactory('BonkletBidder');

	// Create a variable to track the total gas cost of deployment.
	let totalGasCost = ethers.utils.parseEther('0');

	// Deploy the Bonklet item contract.
	let bonkletBidder = await BonkletBidder.connect(deployer.signer).deploy(
		BONKLER_AUCTION,
		BONKLER_NFT,
		BONKLER_TREASURY,
		BONKLET_NFT,
		BONKLET_BIDDER_MINIMUM,
		BIDDER_LIMIT,
		REDEMPTION_QUORUM,
		{ gasPrice: ethers.BigNumber.from('50000000000') }
	);
	let bonkletBidderDeployed = await bonkletBidder.deployed();
	console.log('');
	console.log(`* Bidder deployed to: ${bonkletBidder.address}`);
	totalGasCost = totalGasCost.add(
		await logTransactionGas(bonkletBidderDeployed.deployTransaction)
	);

	// Log a verification command.
	console.log(`[VERIFY] npx hardhat verify --network mainnet ${bonkletBidder.address} "${BONKLER_AUCTION}" "${BONKLER_NFT}" "${BONKLER_TREASURY}" "${BONKLET_NFT}" ${BONKLET_BIDDER_MINIMUM} "${BIDDER_LIMIT}" "${REDEMPTION_QUORUM}"`);

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
