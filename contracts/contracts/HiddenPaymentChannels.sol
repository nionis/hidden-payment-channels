// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

// TODO: import this from the railgun-community package
// required railgun interface
interface IRailgunSmartWallet {
    struct CommitmentPreimage {
        bytes32 npk;
        address token;
        uint256 value;
    }

    struct Ciphertext {
        bytes32[4] encryptedRandom;
        bytes encryptedValue;
    }

    struct ShieldRequest {
        CommitmentPreimage preimage;
        Ciphertext ciphertext;
    }

    function shield(ShieldRequest[] calldata _shieldRequests) external payable;
}

// A single-use smart contract for demo purposes
// This is not a production-ready contract and should not be used in production
// - This contract is assigned to ONE consumer railgun address ONLY
// - Anyone can topup this contract with WETH
// - Only the assigned railgun address can claim tickets
// TODO: add time-locked withdrawl period (e.g. 31 days)
// TODO: prefix signature to prevent replay attacks across EVMs
// TODO: harden the smart contract
contract HiddenPaymentChannels {
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;

    // sepolia weth
    IERC20 public constant WETH =
        IERC20(0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14);

    // sepolia railgun proxy
    IRailgunSmartWallet public constant RAILGUN_PROXY =
        IRailgunSmartWallet(0xeCFCf3b4eC647c4Ca6D49108b311b7a7C9543fea);

    // sepolia railgun adapt address (this one calls claim_ticket)
    address public constant RAILGUN_ADAPT_ADDRESS =
        0x7e3d929EbD5bDC84d02Bd3205c777578f33A214D;

    // the railgun address that the claimed tickets funds will be sent to
    bytes public toRailgunAddress;
    // the address that signs the tickets
    address public ticketSignerAddress;
    // total amount of WETH funded to the contract
    uint256 public totalAmountFunded = 0;
    // total amount of WETH withdrawn from the contract
    uint256 public totalAmountWithdrawn = 0;
    // the last ticket nonce that was claimed
    uint256 public lastTicketNonce = 0;

    constructor(bytes memory _toRailgunAddress, address _ticketSignerAddress) {
        toRailgunAddress = _toRailgunAddress;
        ticketSignerAddress = _ticketSignerAddress;
    }

    // top up the contract with WETH
    function top_up(uint256 amount) external payable {
        require(
            WETH.transferFrom(msg.sender, address(this), amount),
            "transfer failed"
        );
        totalAmountFunded += amount;
    }

    function claim_ticket(
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) external {
        // verify the signature
        require(
            verify_signature(amount, nonce, signature),
            "invalid signature"
        );
        // verify the sender is the railgun adapt address
        require(
            msg.sender == RAILGUN_ADAPT_ADDRESS,
            "only RAILGUN_ADAPT_ADDRESS can claim ticket"
        );
        // verify the contract has enough WETH
        require(
            amount <= WETH.balanceOf(address(this)),
            "insufficient balance"
        );
        // verify the nonce is greater than the last ticket nonce
        require(nonce > lastTicketNonce, "invalid nonce");

        // transfer the WETH to the railgun adapt address
        require(WETH.transfer(msg.sender, amount), "transfer failed");
        totalAmountWithdrawn += amount;
        lastTicketNonce = nonce;
    }

    // verify the signature
    // TODO: prefix signature to prevent replay attacks across EVMs
    function verify_signature(
        uint256 amount,
        uint256 nonce,
        bytes memory signature
    ) public view returns (bool) {
        bytes32 messageHash = keccak256(
            abi.encodePacked(
                keccak256(toRailgunAddress),
                amount,
                nonce,
                address(this)
            )
        );

        return messageHash.recover(signature) == ticketSignerAddress;
    }
}
