import { type Contract, type ContractTransaction, toUtf8String } from "ethers";
import {
  type RecipeERC20Info,
  type StepInput,
  type UnvalidatedStepOutput,
  Step,
} from "@railgun-community/cookbook";
import { ClaimableTicket } from "../types";

export default class ClaimTicketStep extends Step {
  readonly config = {
    name: "HiddenPaymentChannels Claim Ticket",
    description: "Handles claim ticket call in HiddenPaymentChannels contract.",
    hasNonDeterministicOutput: false,
  };

  constructor(
    private readonly hpcContract: Contract,
    private readonly tokenInfo: RecipeERC20Info,
    private readonly claimableTicket: ClaimableTicket
  ) {
    super();
  }

  protected async getStepOutput(
    input: StepInput
  ): Promise<UnvalidatedStepOutput> {
    const { nfts } = input;

    const receiverRailGunAddress = await this.hpcContract
      .toRailgunAddress()
      .then((hex) => toUtf8String(hex));
    const amount = BigInt(this.claimableTicket.amount);

    // account for the 0.25% shield fee when tokens are shielded back to the user
    const SHIELD_FEE_BASIS_POINTS = 25n; // 0.25% = 25 basis points
    const amountAfterShieldFee =
      (amount * (10000n - SHIELD_FEE_BASIS_POINTS)) / 10000n;

    console.log("ticket amount", amount);
    console.log("amount after shield fee", amountAfterShieldFee);

    const crossContractCalls: ContractTransaction[] = [];

    crossContractCalls.push(
      await this.hpcContract.claim_ticket.populateTransaction(
        amount,
        this.claimableTicket.nonce,
        this.claimableTicket.signature
      )
    );

    return {
      crossContractCalls,
      spentERC20Amounts: [],
      outputERC20Amounts: [
        {
          tokenAddress: this.tokenInfo.tokenAddress,
          decimals: this.tokenInfo.decimals,
          recipient: receiverRailGunAddress,
          expectedBalance: amountAfterShieldFee,
          minBalance: amountAfterShieldFee,
          approvedSpender: undefined,
        },
      ],
      spentNFTs: [],
      outputNFTs: nfts,
      feeERC20AmountRecipients: [],
    };
  }
}
