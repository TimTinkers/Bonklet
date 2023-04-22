'use strict';

// Imports.
import { ethers } from 'hardhat';
import { expect, should } from 'chai';
should();

/**
  Describe the contract testing suite, retrieve testing wallets, and create
  contract factories from the artifacts we are testing.
*/
describe('BonkletBidder', function () {
	let alice, bob, carol, dev;
	let BonklerNFT, BonklerAuction, BonklerTreasury, BonkletNFT, BonkletBidder;
	before(async () => {
		const signers = await ethers.getSigners();
		const addresses = await Promise.all(signers.map(async signer => signer.getAddress()));
		alice = { provider: signers[0].provider, signer: signers[0], address: addresses[0] };
		bob = { provider: signers[1].provider, signer: signers[1], address: addresses[1] };
		carol = { provider: signers[2].provider, signer: signers[2], address: addresses[2] };
		dev = { provider: signers[3].provider, signer: signers[3], address: addresses[3] };

		BonklerNFT = await ethers.getContractFactory('BonklerNFT');
		BonklerAuction = await ethers.getContractFactory('BonklerAuction');
		BonklerTreasury = await ethers.getContractFactory('BonklerTreasury');
		BonkletNFT = await ethers.getContractFactory('Bonklet');
		BonkletBidder = await ethers.getContractFactory('BonkletBidder');
	});

	// Deploy a fresh set of smart contracts, using these constants, for testing.
	const RESERVE_PRICE = ethers.utils.parseEther('0.1');
	const BID_INCREMENT = ethers.utils.parseEther('0.1');
	const DURATION = 60 * 60 * 23;
	const TIME_BUFFER = 60 * 15;
	const RESERVE_PERCENTAGE = 70;
	const BONKLET_NAME = 'BONKLET';
	const BONKLET_SYMBOL = 'BNKLT';
	const METADATA_URI = 'https://s3.amazonaws.com/';
	const BONKLET_CAP = ethers.BigNumber.from('800');
	const BONKLET_BIDDER_MINIMUM = ethers.BigNumber.from(
		ethers.utils.parseEther('0.1')
	);
	const BIDDER_LIMIT = 2;
	const REDEMPTION_QUORUM = 60;
	let bonklerNFT, bonklerAuction, bonklerTreasury, bonkletNFT, bonkletBidder;
	beforeEach(async () => {
		// Deploy the Bonkler.
		bonklerNFT = await BonklerNFT.connect(alice.signer).deploy();

		// Deploy an instance of the BonklerAuction contract.
		bonklerAuction = await BonklerAuction.connect(alice.signer).deploy(
			bonklerNFT.address,
			RESERVE_PRICE,
			BID_INCREMENT,
			DURATION,
			TIME_BUFFER,
			RESERVE_PERCENTAGE
		);

		// Make the auction the admin to mint Bonklers.
		await bonklerNFT.connect(alice.signer).setMinter(
			bonklerAuction.address
		);

		// Deploy an extended Bonkler treasury.
		bonklerTreasury = await BonklerTreasury.connect(alice.signer).deploy(
			bonklerNFT.address
		);

		// Deploy a Bonklet instance.
		bonkletNFT = await BonkletNFT.connect(alice.signer).deploy(
			BONKLET_NAME,
			BONKLET_SYMBOL,
			METADATA_URI,
			BONKLET_CAP
		);

		// Deploy the Bonklet bidder.
		bonkletBidder = await BonkletBidder.connect(alice.signer).deploy(
			bonklerAuction.address,
			bonklerNFT.address,
			bonklerTreasury.address,
			bonkletNFT.address,
			BONKLET_BIDDER_MINIMUM,
			BIDDER_LIMIT,
			REDEMPTION_QUORUM
		);

		// Make the Bonklet bidder admin to mint Bonklets.
		await bonkletNFT.connect(alice.signer).setAdmin(
			bonkletBidder.address,
			true
		);
	});

	// Prepare the Bonkler auction.
	context('bonkler auction setup', async function () {
		beforeEach(async function () {
			await bonklerAuction.connect(alice.signer).addGenerationHashHashes(
				[
					ethers.utils.solidityKeccak256([ 'uint256' ], [ 1 ]),
					ethers.utils.solidityKeccak256([ 'uint256' ], [ 2 ]),
					ethers.utils.solidityKeccak256([ 'uint256' ], [ 3 ])
				]
			);
		});

		// Run a simulated fractionalized auction.
		describe('simulated auction', async function () {
			it('auction simulation, bonklets win, then redeem', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle Bob's auction by creating a new bid.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				priorBlockNumber = await ethers.provider.getBlockNumber();
				priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				bobBidTime = priorBlock.timestamp;

				// Confirm Bob's receipt of the Bonkler.
				let bobBonklerBalance = await bonklerNFT.balanceOf(bob.address);
				bobBonklerBalance.should.be.equal(1);
				let ownerOfOne = await bonklerNFT.ownerOf(1);
				ownerOfOne.should.be.equal(bob.address);

				// Confirm Bob is the highest bidder.
				let bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bob.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.1'));

				// Confirm that the fractionalizer enforces a bid minimum.
				await expect(
					bonkletBidder.connect(carol.signer).stageBid(2, 2, {
						value: ethers.utils.parseEther('0.01')
					})
				).to.be.revertedWith('InvalidBidAmount');

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Crossing the auction threshold will activate the bid.
				await bonkletBidder.connect(dev.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Confirm the fractionalizer is the highest bidder.
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bonkletBidder.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.2'));

				// Confirm that the fractionalizer is unable to overbid itself.
				await expect(
					bonkletBidder.connect(carol.signer).stageBid(2, 2, {
						value: ethers.utils.parseEther('0.1')
					})
				).to.be.revertedWith('AlreadyWinningAuction');

				// Confirm that the fractionalizer is refunded to appropriately rebid.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.3')
				});
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bob.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.3'));
				await bonkletBidder.connect(carol.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bob.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.3'));
				await bonkletBidder.connect(carol.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bonkletBidder.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.4'));

				// Confirm that the fractionalizer may be settled if it wins.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the second auction by beginning the third one.
				await bonklerAuction.connect(bob.signer).createBid(3, 3, {
					value: ethers.utils.parseEther('0.1')
				});

				// Confirm the fractionalizer's receipt of the Bonkler.
				let bonklerBalance = await bonklerNFT.balanceOf(bonkletBidder.address);
				bonklerBalance.should.be.equal(1);
				let ownerOfTwo = await bonklerNFT.ownerOf(2);
				ownerOfTwo.should.be.equal(bonkletBidder.address);

				// Settle the auction to mint Bonklets.
				await bonkletBidder.connect(carol.signer).settle(2);
				let bonkletOwnerOne = await bonkletNFT.ownerOf(1);
				bonkletOwnerOne.should.be.equal(carol.address);
				let bonkletOwnerTwo = await bonkletNFT.ownerOf(2);
				bonkletOwnerTwo.should.be.equal(dev.address);
				let bonkletDataOne = await bonkletBidder.bonkletData(1);
				bonkletDataOne.bonklerId.should.be.equal(2);
				bonkletDataOne.stagedEther.should.be.equal(
					ethers.utils.parseEther('0.3')
				);
				let bonkletDataTwo = await bonkletBidder.bonkletData(2);
				bonkletDataTwo.bonklerId.should.be.equal(2);
				bonkletDataTwo.stagedEther.should.be.equal(
					ethers.utils.parseEther('0.1')
				);

				// Vote for redemption.
				await bonkletBidder.connect(dev.signer).redeem(2);
				bonklerBalance = await bonklerNFT.balanceOf(bonkletBidder.address);
				bonklerBalance.should.be.equal(1);
				ownerOfTwo = await bonklerNFT.ownerOf(2);
				ownerOfTwo.should.be.equal(bonkletBidder.address);
				let voted = await bonkletBidder.redemptionVoted(2);
				voted.should.be.equal(true);
				let shares = await bonkletBidder.redemptionShares(2);
				shares.should.be.equal(ethers.utils.parseEther('0.1'));

				// Toggle vote for redemption.
				await bonkletBidder.connect(dev.signer).redeem(2);
				bonklerBalance = await bonklerNFT.balanceOf(bonkletBidder.address);
				bonklerBalance.should.be.equal(1);
				ownerOfTwo = await bonklerNFT.ownerOf(2);
				ownerOfTwo.should.be.equal(bonkletBidder.address);
				voted = await bonkletBidder.redemptionVoted(2);
				voted.should.be.equal(false);
				shares = await bonkletBidder.redemptionShares(2);
				shares.should.be.equal(0);

				// Fund the extended treasury with out-of-band income.
				await alice.signer.sendTransaction({
					to: bonklerTreasury.address,
					value: ethers.utils.parseEther('1')
				});

				// Achieve redemption quorum.
				let bidderInitialBalance = await bob.provider.getBalance(
					bonkletBidder.address
				);
				await bonkletBidder.connect(carol.signer).redeem(1);
				bonklerBalance = await bonklerNFT.balanceOf(bonkletBidder.address);
				bonklerBalance.should.be.equal(0);
				voted = await bonkletBidder.redemptionVoted(1);
				voted.should.be.equal(true);
				shares = await bonkletBidder.redemptionShares(2);
				shares.should.be.equal(ethers.utils.parseEther('0.3'));

				// Confirm that the redeemed Ether is present in the bidder.
				let bidderFinalBalance = await bob.provider.getBalance(
					bonkletBidder.address
				);
				bidderFinalBalance.sub(bidderInitialBalance).should.be.closeTo(
					ethers.utils.parseEther('1.08'),
					'100000000000000'
				);

				// Bonklet holders may claim redeemed Ether relative to their shares.
				await bonkletNFT.connect(carol.signer).approve(
					bonkletBidder.address,
					1
				);
				bidderInitialBalance = await bob.provider.getBalance(
					bonkletBidder.address
				);
				let carolInitialBalance = await carol.provider.getBalance(
					carol.address
				);
				await bonkletBidder.connect(carol.signer).claim(1);

				// Confirm that the Ether was transferred correctly.
				bidderFinalBalance = await bob.provider.getBalance(
					bonkletBidder.address
				);
				let carolFinalBalance = await carol.provider.getBalance(
					carol.address
				);
				bidderInitialBalance.sub(bidderFinalBalance).should.be.closeTo(
					ethers.utils.parseEther('0.81'),
					'100000000000000'
				);
				carolFinalBalance.sub(carolInitialBalance).should.be.closeTo(
					ethers.utils.parseEther('0.81'),
					'100000000000000'
				);
			});

			it('auction simulation, bonklets win, then transfer', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle Bob's auction by creating a new bid.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				priorBlockNumber = await ethers.provider.getBlockNumber();
				priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				bobBidTime = priorBlock.timestamp;

				// Confirm Bob's receipt of the Bonkler.
				let bobBonklerBalance = await bonklerNFT.balanceOf(bob.address);
				bobBonklerBalance.should.be.equal(1);
				let ownerOfOne = await bonklerNFT.ownerOf(1);
				ownerOfOne.should.be.equal(bob.address);

				// Confirm Bob's redemption of a burnt Bonkler.
				let bobInitialBalance = await bob.provider.getBalance(bob.address);
				await bonklerNFT.connect(bob.signer).redeemBonkler(1);
				let bobFinalBalance = await bob.provider.getBalance(bob.address);
				bobFinalBalance.sub(bobInitialBalance).should.be.closeTo(
					ethers.utils.parseEther('0.07'),
					'100000000000000'
				);

				// Confirm Bob is the highest bidder.
				let bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bob.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.1'));

				// Confirm that the fractionalizer enforces a bid minimum.
				await expect(
					bonkletBidder.connect(carol.signer).stageBid(2, 2, {
						value: ethers.utils.parseEther('0.01')
					})
				).to.be.revertedWith('InvalidBidAmount');

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Crossing the auction threshold will activate the bid.
				await bonkletBidder.connect(dev.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Confirm the fractionalizer is the highest bidder.
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bonkletBidder.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.2'));

				// Confirm that the fractionalizer is unable to overbid itself.
				await expect(
					bonkletBidder.connect(carol.signer).stageBid(2, 2, {
						value: ethers.utils.parseEther('0.1')
					})
				).to.be.revertedWith('AlreadyWinningAuction');

				// Confirm that the fractionalizer is refunded to appropriately rebid.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.3')
				});
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bob.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.3'));
				await bonkletBidder.connect(carol.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bob.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.3'));
				await bonkletBidder.connect(carol.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bonkletBidder.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.4'));

				// Confirm that the fractionalizer may be settled if it wins.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the second auction by beginning the third one.
				await bonklerAuction.connect(bob.signer).createBid(3, 3, {
					value: ethers.utils.parseEther('0.1')
				});

				// Confirm the fractionalizer's receipt of the Bonkler.
				let bonklerBalance = await bonklerNFT.balanceOf(bonkletBidder.address);
				bonklerBalance.should.be.equal(1);
				let ownerOfTwo = await bonklerNFT.ownerOf(2);
				ownerOfTwo.should.be.equal(bonkletBidder.address);

				// Settle the auction to mint Bonklets.
				await bonkletBidder.connect(carol.signer).settle(2);
				let bonkletOwnerOne = await bonkletNFT.ownerOf(1);
				bonkletOwnerOne.should.be.equal(carol.address);
				let bonkletOwnerTwo = await bonkletNFT.ownerOf(2);
				bonkletOwnerTwo.should.be.equal(dev.address);
				let bonkletDataOne = await bonkletBidder.bonkletData(1);
				bonkletDataOne.bonklerId.should.be.equal(2);
				bonkletDataOne.stagedEther.should.be.equal(
					ethers.utils.parseEther('0.3')
				);
				let bonkletDataTwo = await bonkletBidder.bonkletData(2);
				bonkletDataTwo.bonklerId.should.be.equal(2);
				bonkletDataTwo.stagedEther.should.be.equal(
					ethers.utils.parseEther('0.1')
				);

				// Vote for transfer.
				await bonkletBidder.connect(dev.signer).transfer(2, alice.address);
				let transferVote = await bonkletBidder.transferVoted(2, alice.address);
				transferVote.should.be.equal(true);
				let transferShares = await bonkletBidder.transferShares(
					2,
					alice.address
				);
				transferShares.should.be.equal(ethers.utils.parseEther('0.1'));
				await bonkletBidder.connect(carol.signer).transfer(1, bob.address);
				transferVote = await bonkletBidder.transferVoted(1, alice.address);
				transferVote.should.be.equal(false);
				transferVote = await bonkletBidder.transferVoted(1, bob.address);
				transferVote.should.be.equal(true);
				transferShares = await bonkletBidder.transferShares(
					2,
					alice.address
				);
				transferShares.should.be.equal(ethers.utils.parseEther('0.1'));
				transferShares = await bonkletBidder.transferShares(
					2,
					bob.address
				);
				transferShares.should.be.equal(ethers.utils.parseEther('0.3'));

				// Toggle vote for transfer.
				await bonkletBidder.connect(dev.signer).transfer(2, alice.address);
				transferVote = await bonkletBidder.transferVoted(2, alice.address);
				transferVote.should.be.equal(false);
				transferShares = await bonkletBidder.transferShares(
					2,
					alice.address
				);
				transferShares.should.be.equal(0);

				// Complete transfer vote.
				await bonkletBidder.connect(dev.signer).transfer(2, bob.address);
				transferShares = await bonkletBidder.transferShares(
					2,
					bob.address
				);
				transferShares.should.be.equal(ethers.utils.parseEther('0.4'));
				bonklerBalance = await bonklerNFT.balanceOf(bonkletBidder.address);
				bonklerBalance.should.be.equal(0);
				bonklerBalance = await bonklerNFT.balanceOf(bob.address);
				bonklerBalance.should.be.equal(1);
				ownerOfTwo = await bonklerNFT.ownerOf(2);
				ownerOfTwo.should.be.equal(bob.address);
			});

			it('auction simulation, bonklets lose', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle Bob's auction by creating a new bid.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				priorBlockNumber = await ethers.provider.getBlockNumber();
				priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				bobBidTime = priorBlock.timestamp;

				// Confirm Bob's receipt of the Bonkler.
				let bobBonklerBalance = await bonklerNFT.balanceOf(bob.address);
				bobBonklerBalance.should.be.equal(1);
				let ownerOfOne = await bonklerNFT.ownerOf(1);
				ownerOfOne.should.be.equal(bob.address);

				// Confirm Bob is the highest bidder.
				let bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bob.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.1'));

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Crossing the auction threshold will activate the bid.
				await bonkletBidder.connect(dev.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Confirm the fractionalizer is the highest bidder.
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bonkletBidder.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.2'));

				// Confirm that the fractionalizer is refunded to appropriately rebid.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.3')
				});
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bob.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.3'));
				await bonkletBidder.connect(carol.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bob.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.3'));
				await bonkletBidder.connect(carol.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				bid = await bonklerAuction.auctionData();
				bid.bidder.should.be.equal(bonkletBidder.address);
				bid.amount.should.be.equal(ethers.utils.parseEther('0.4'));

				// Bob wins.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.5')
				});

				// Confirm that the fractionalizer may be settled if it wins.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the second auction by beginning the third one.
				await bonklerAuction.connect(bob.signer).createBid(3, 3, {
					value: ethers.utils.parseEther('0.1')
				});
				priorBlockNumber = await ethers.provider.getBlockNumber();
				priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				bobBidTime = priorBlock.timestamp;

				// Confirm Bob's receipt of the Bonkler.
				let bonklerBalance = await bonklerNFT.balanceOf(bob.address);
				bonklerBalance.should.be.equal(2);
				let ownerOfTwo = await bonklerNFT.ownerOf(2);
				ownerOfTwo.should.be.equal(bob.address);

				// Confirm that failed bidders are able to withdraw their funds.
				let carolInitialBalance = await carol.provider.getBalance(
					carol.address
				);
				await bonkletBidder.connect(carol.signer).withdrawBid(2);
				let carolFinalBalance = await carol.provider.getBalance(carol.address);
				carolFinalBalance.sub(carolInitialBalance).should.be.closeTo(
					ethers.utils.parseEther('0.3'),
					'100000000000000'
				);
				let devInitialBalance = await dev.provider.getBalance(
					dev.address
				);
				await bonkletBidder.connect(dev.signer).withdrawBid(2);
				let devFinalBalance = await dev.provider.getBalance(dev.address);
				devFinalBalance.sub(devInitialBalance).should.be.closeTo(
					ethers.utils.parseEther('0.1'),
					'100000000000000'
				);

				// Create a failing bid on the last Bonkler.
				await bonkletBidder.connect(carol.signer).stageBid(3, 3, {
					value: ethers.utils.parseEther('0.2')
				});

				// Bob wins again.
				await bonklerAuction.connect(bob.signer).createBid(3, 3, {
					value: ethers.utils.parseEther('0.5')
				});

				// Confirm that the fractionalizer may be settled if it wins.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);
				await bonklerAuction.connect(carol.signer).settleAuction();

				// Confirm that failed bidders are able to withdraw their funds.
				carolInitialBalance = await carol.provider.getBalance(
					carol.address
				);
				await bonkletBidder.connect(carol.signer).withdrawBid(3);
				carolFinalBalance = await carol.provider.getBalance(carol.address);
				carolFinalBalance.sub(carolInitialBalance).should.be.closeTo(
					ethers.utils.parseEther('0.2'),
					'100000000000000'
				);
			});

			it('prevent fractionalizer rugpull', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.2')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the first auction by beginning the second one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});
				priorBlockNumber = await ethers.provider.getBlockNumber();
				priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				bobBidTime = priorBlock.timestamp;

				// Crossing the auction threshold will activate the bid.
				await bonkletBidder.connect(dev.signer).stageBid(2, 2, {
					value: ethers.utils.parseEther('0.2')
				});

				// Bob wins.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.5')
				});

				// Carol steals the bid from the previously-finalized auction.
				await expect(
					bonkletBidder.connect(carol.signer).withdrawBid(1)
				).to.be.revertedWith('CannotWithdrawSettledItem');
			});

			it('prevent overfractionalization', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.2')
				});

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Alice may not overfractionalize the bid.
				await expect(
					bonkletBidder.connect(alice.signer).stageBid(1, 1, {
						value: ethers.utils.parseEther('0.1')
					})
				).to.be.revertedWith('CannotOverfractionalize');
			});

			it('prevent bidding on inactive auction', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.2')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Carol may not bid on a future Bonkler.
				await expect(
					bonkletBidder.connect(carol.signer).stageBid(2, 2, {
						value: ethers.utils.parseEther('0.1')
					})
				).to.be.revertedWith('InvalidBonklerBid');

				// The bidder wins the auction.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the first auction by beginning the second one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Carol may not bid on an old Bonkler.
				await expect(
					bonkletBidder.connect(carol.signer).stageBid(1, 1, {
						value: ethers.utils.parseEther('0.1')
					})
				).to.be.revertedWith('InvalidBonklerBid');
			});

			it('prevent withdrawing from active bid', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.2')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Carol may not withdraw from the active bid.
				await expect(
					bonkletBidder.connect(carol.signer).withdrawBid(1)
				).to.be.revertedWith('CannotWithdrawActiveBid');

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the first auction by beginning the second one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Jump to one day after Bob's bid.
				priorBlockNumber = await ethers.provider.getBlockNumber();
				priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				bobBidTime = priorBlock.timestamp;
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the second auction by beginning the third one.
				await bonklerAuction.connect(bob.signer).createBid(3, 3, {
					value: ethers.utils.parseEther('0.3')
				});
				priorBlockNumber = await ethers.provider.getBlockNumber();
				priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				bobBidTime = priorBlock.timestamp;

				// Prepare a fractional bid.
				await bonkletBidder.connect(carol.signer).stageBid(3, 3, {
					value: ethers.utils.parseEther('0.2')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the final auction.
				await bonklerAuction.connect(carol.signer).settleAuction();

				// Swallow a zero-value withdrawal.
				await bonkletBidder.connect(dev.signer).withdrawBid(3);

				// Carol may withdraw from the last Bonkler.
				let carolInitialBalance = await carol.provider.getBalance(
					carol.address
				);
				await bonkletBidder.connect(carol.signer).withdrawBid(3);
				let carolFinalBalance = await carol.provider.getBalance(carol.address);
				carolFinalBalance.sub(carolInitialBalance).should.be.closeTo(
					ethers.utils.parseEther('0.2'),
					'100000000000000'
				);
			});

			it('prevent settlement of unwon auctions', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.2')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.2')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Bob wins.
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.4')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Only won bids may be settled.
				await expect(
					bonkletBidder.connect(alice.signer).settle(1)
				).to.be.revertedWith('CannotSettle');
			});

			it('prevent double-settlement of auctions', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.2')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.2')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the Bonkler auction by beginning the next one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Settle the bid with Bonklets as the winner.
				bonkletBidder.connect(alice.signer).settle(1);

				// Bids can only be settled once.
				await expect(
					bonkletBidder.connect(alice.signer).settle(1)
				).to.be.revertedWith('CannotSettle');
			});

			it('prevent unauthorized redemption', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the Bonkler auction by beginning the next one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Mint Bonklets by settling the Bonklet bid.
				await bonkletBidder.connect(alice.signer).settle(1);

				// Carol cannot vote with someone else's Bonklet.
				await expect(
					bonkletBidder.connect(carol.signer).redeem(2)
				).to.be.revertedWith('Unauthorized');
			});

			it('prevent unauthorized claim', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the Bonkler auction by beginning the next one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Mint Bonklets by settling the Bonklet bid.
				await bonkletBidder.connect(alice.signer).settle(1);

				// Carol cannot claim with someone else's Bonklet.
				await expect(
					bonkletBidder.connect(carol.signer).claim(2)
				).to.be.revertedWith('Unauthorized');
			});

			it('prevent unauthorized transfer', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the Bonkler auction by beginning the next one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Mint Bonklets by settling the Bonklet bid.
				await bonkletBidder.connect(alice.signer).settle(1);

				// Carol cannot vote with someone else's Bonklet.
				await expect(
					bonkletBidder.connect(carol.signer).transfer(2, alice.address)
				).to.be.revertedWith('Unauthorized');
			});

			it('prevent unsettled redemption', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the Bonkler auction by beginning the next one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Directly mint a Bonklet to Carol.
				await bonkletNFT.connect(alice.signer).mint_Qgo(carol.address, 1);

				/*
					Nothing can go wrong with directly-interceded items because they have no Bonklet shares; a divide-by-zero error protects us.
				*/
				await expect(
					bonkletBidder.connect(carol.signer).redeem(1)
				).to.be.revertedWith('0x12');
			});

			it('prevent unredeemed claim', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the Bonkler auction by beginning the next one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Directly mint a Bonklet to Carol.
				await bonkletNFT.connect(alice.signer).mint_Qgo(carol.address, 1);

				// Revert Carol's claim to prevent a worthless Bonklet lock.
				await expect(
					bonkletBidder.connect(carol.signer).claim(1)
				).to.be.revertedWith('');
			});

			it('prevent unsettled transfer', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// Settle the Bonkler auction by beginning the next one.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Directly mint a Bonklet to Carol.
				await bonkletNFT.connect(alice.signer).mint_Qgo(carol.address, 1);

				/*
					Nothing can go wrong with directly-interceded items because they have no Bonklet shares; they will always target a non-existent Bonkler 0.
				*/
				await expect(
					bonkletBidder.connect(carol.signer).transfer(1, alice.address)
				).to.be.revertedWith('ERC721: operator query for nonexistent token');
			});

			it('check the strange consolatory case', async function () {
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Get the time at which Bob bid.
				let priorBlockNumber = await ethers.provider.getBlockNumber();
				let priorBlock = await ethers.provider.getBlock(priorBlockNumber);
				let bobBidTime = priorBlock.timestamp;

				// Prepare a fractionalized bid through the Bonklet bidder.
				await bonkletBidder.connect(carol.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});
				await bonkletBidder.connect(dev.signer).stageBid(1, 1, {
					value: ethers.utils.parseEther('0.1')
				});

				// Bob wins.
				await bonklerAuction.connect(bob.signer).createBid(1, 1, {
					value: ethers.utils.parseEther('0.3')
				});

				// Jump to one day after Bob's bid.
				await ethers.provider.send('evm_setNextBlockTimestamp', [
					bobBidTime + (60 * 60 * 24)
				]);

				// End the auction to give the Bonkler to Bob.
				await bonklerAuction.connect(bob.signer).createBid(2, 2, {
					value: ethers.utils.parseEther('0.1')
				});

				// Bob gives the Bonkler to the Bonklets anyways.
				await bonklerNFT.connect(bob.signer).transferFrom(
					bob.address,
					bonkletBidder.address,
					1
				);

				// Settle the auction to mint Bonklets.
				await bonkletBidder.connect(carol.signer).settle(1);
				let bonkletOwnerOne = await bonkletNFT.ownerOf(1);
				bonkletOwnerOne.should.be.equal(carol.address);
				let bonkletOwnerTwo = await bonkletNFT.ownerOf(2);
				bonkletOwnerTwo.should.be.equal(dev.address);
				let bonkletDataOne = await bonkletBidder.bonkletData(1);
				bonkletDataOne.bonklerId.should.be.equal(1);
				bonkletDataOne.stagedEther.should.be.equal(
					ethers.utils.parseEther('0.1')
				);
				let bonkletDataTwo = await bonkletBidder.bonkletData(2);
				bonkletDataTwo.bonklerId.should.be.equal(1);
				bonkletDataTwo.stagedEther.should.be.equal(
					ethers.utils.parseEther('0.1')
				);

				// Vote for transfer.
				await bonkletBidder.connect(carol.signer).transfer(1, bob.address);
				await bonkletBidder.connect(dev.signer).transfer(2, bob.address);
				let transferShares = await bonkletBidder.transferShares(
					1,
					bob.address
				);
				transferShares.should.be.equal(ethers.utils.parseEther('0.2'));
				let bonklerBalance = await bonklerNFT.balanceOf(bonkletBidder.address);
				bonklerBalance.should.be.equal(0);
				bonklerBalance = await bonklerNFT.balanceOf(bob.address);
				bonklerBalance.should.be.equal(1);
				let ownerOfOne = await bonklerNFT.ownerOf(1);
				ownerOfOne.should.be.equal(bob.address);
			});

			it('prevent stuck Ether', async function () {
				await expect(
					alice.signer.sendTransaction({
						to: bonkletBidder.address,
						value: ethers.utils.parseEther('1')
					})
				).to.be.revertedWith('SenderNotTreasury');
			});
		});
	});
});
