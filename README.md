# Bonklet
A fractionalized bidding and improved treasury system for Remilia's Bonklers. This introduces three new contracts to the Bonkler space. The repository for the [bonklet.com](https://bonklet.com) frontend is [here](https://github.com/TimTinkers/Bonklet-Interface).

## Extended Treasury

A new [`BonklerTreasury`](https://github.com/TimTinkers/Bonklet/blob/master/contracts/bonklet/BonklerTreasury.sol) treasury contract has been implemented. It is deployed live at [`0xb92C17AB4AfBed8140b7bB09Fb7aae92b0EFe522`](https://etherscan.io/address/0xb92C17AB4AfBed8140b7bB09Fb7aae92b0EFe522#code). As originally implemented, each Bonkler holds 70% of its bid price as a reserve that may be redeemed at any time. There is, however, no room for the growth of this reserve. The `BonklerTreasury` presents a vault into which external revenue streams may deposit Ether. Any Bonkler redeemed through this extended treasury system will receive its 70% reserve plus a share of any additionally-accumulated Ether.

## Bonklet

A new [`Bonklet`](https://github.com/TimTinkers/Bonklet/blob/master/contracts/assets/erc721/Bonklet.sol) sub-NFT contract has been implemented. It is deployed live at [`0x68c51841b4dF39FB84f292cA26B76E7E2b4f1965`](https://etherscan.io/address/0x68c51841b4dF39FB84f292cA26B76E7E2b4f1965#code). This is a simple ERC-721 contract that doesn't do anything special beyond its role in governing the `BonkletBidder`.

## Bonklet Fractionalized Bidder

A new [`BonkletBidder`](https://github.com/TimTinkers/Bonklet/blob/master/contracts/bonklet/BonkletBidder.sol) fractionalized Bonkler bidding contract has been implemented. It is deployed live at [`0x7964929ecbaf3f9704edcd6120126f6e85900883`](https://etherscan.io/address/0x7964929ecbaf3f9704edcd6120126f6e85900883#code). This contract supports multiple independent callers to pool Ether to bid on a shared Bonkler together. Shared ownership of the Bonkler is tracked by minting `Bonklet` sub-NFTs. Bonklet holders may later vote to redeem the shared Bonkler through the `BonklerTreasury` or to transfer the shared Bonkler elsewhere.
