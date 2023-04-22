// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

import "../interfaces/IBonklerNFT.sol";

/**
	Thrown when unable to withdraw Ether from the contract.
*/
error EtherTransferWasUnsuccessful ();

/**
	@custom:benediction DEVS BENEDICAT ET PROTEGAT CONTRACTVS MEAM
	@title An improved treasury for Bonkler.
	@author Tim Clancy <tim-clancy.eth>
	@custom:version 1.0

	Bonkler is a religious artifact bestowed to us by the Remilia Corporation. 
	Currently, the pool of Bonkler reserve assets cannot be independently grown 
	such that redemption of a Bonkler returns more Ether than its direct floor 
	reserve price. This contract is a wrapping treasury around the Bonkler 
	reserve system that allows for growth via external revenue streams.

	@custom:date April 20th, 2023.
*/
contract BonklerTreasury is ReentrancyGuard {

	/// The address of the Bonkler NFT contract.
	address immutable public BONKLER;

	/**
		This event is emitted when a Bonkler is redeemed from this treasury.

		@param redeemer The address of the caller who redeemed the Bonkler.
		@param bonklerId The Bonkler ID redeemed.
		@param amount The amount of Ether sent as a redemption reward.
	*/
	event BonklerRedeemed (
		address indexed redeemer,
		uint256 bonklerId,
		uint256 amount
	);

	/**
		This event is emitted when the treasury receives Ether.

		@param sender The address which sent Ether.
		@param value The amount of Ether received.
	*/
	event Received (
		address indexed sender,
		uint256 value
	);

	/**
		Construct a new instance of the extended Bonkler treasury by specifying the 
		address of the NFT.

		@param _bonkler The address of the Bonkler NFT contract.
	*/
	constructor (
		address _bonkler
	) {
		BONKLER = _bonkler;
	}

	/**
		Allow a Bonkler holder to burn a Bonkler and redeem the Ether inside it. 
		Burning a Bonkler through this treasury also returns a share of any 
		additional accumulated Ether.

		The BonklerNFT contract has no native support for delegated redemption, so 
		this treasury contract must first be approved to spend the caller's 
		Bonkler. It must first take possession of the Bonkler before it is able to 
		burn the initial reserve.

		@param _bonklerId The ID of the Bonkler to burn and redeem.

		@return _ The total amount that was redeemed.
	*/
	function redeemBonkler (
		uint256 _bonklerId
	) external nonReentrant returns (uint256) {

		// Transfer the caller's Bonkler to this treasury wrapper.
		IERC721(BONKLER).transferFrom(msg.sender, address(this), _bonklerId);

		/*
			Calculate the portion of this wrapper treasury's balance due to the 
			redeemed Bonkler. The total number of circulating Bonkler shares is 
			simply the NFT balance.
		*/
		uint256 shares = IBonklerNFT(BONKLER).getBonklerShares(_bonklerId);
		uint256 total;
		unchecked {
			total = (shares * address(this).balance / BONKLER.balance) + shares;
		}

		// Redeem the Bonkler.
		IBonklerNFT(BONKLER).redeemBonkler(_bonklerId);

		// Transfer the Bonkler plus any excess to the caller.
		(bool success, ) = (msg.sender).call{ value: total }("");
		if (!success) {
			revert EtherTransferWasUnsuccessful();
		}

		// Emit an event and return.
		emit BonklerRedeemed(msg.sender, _bonklerId, total);
		return total;
	}

	/**
		This function allows the extneded treasury to receive Ether from the world.
	*/
	receive () external payable {
		emit Received(msg.sender, msg.value);
	}
}
