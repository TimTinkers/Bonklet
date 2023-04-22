// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.19;

/**
	@custom:benediction DEVS BENEDICAT ET PROTEGAT CONTRACTVS MEAM
	@title An interface for the BonklerNFT contract.
	@author Tim Clancy <tim-clancy.eth>

	The BonklerNFT contract manages the redemption of Bonklers.

	@custom:date April 20th, 2023.
*/
interface IBonklerNFT {

	/**
		Return the amount of Ether stored in a particular Bonkler.

		@param _bonklerId The ID of the Bonkler to find stored Ether for.

		@return _ The amount of Ether stored in the Bonkler.
	*/
	function getBonklerShares (
		uint256 _bonklerId
	) external view returns (uint256);

	/**
		Allow a Bonkler holder to burn a Bonkler and redeem the Ether inside it.

		@param _bonklerId The ID of the Bonkler to burn and redeem.
	*/
	function redeemBonkler (
		uint256 _bonklerId
	) external;
}
