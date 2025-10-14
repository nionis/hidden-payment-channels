import type { Contract, ContractTransaction } from "ethers";
import {
  type RecipeERC20Info,
  type ERC20Contract,
  type StepInput,
  type UnvalidatedStepOutput,
  type RecipeERC20AmountRecipient,
  Step,
  compareERC20Info,
} from "@railgun-community/cookbook";

export default class TopUpStep extends Step {
  readonly config = {
    name: "HiddenPayments TopUp Call",
    description: "Handles top_up call to HiddenPayments contract.",
    hasNonDeterministicOutput: false,
  };

  constructor(
    private readonly hiddenPaymentsContract: Contract,
    private readonly wethContractHelper: ERC20Contract,
    private readonly spender: string,
    private readonly tokenInfo: RecipeERC20Info
  ) {
    super();
  }

  protected async getStepOutput(
    input: StepInput
  ): Promise<UnvalidatedStepOutput> {
    const { erc20Amounts, nfts } = input;
    const hiddenPaymentsContractAddress =
      await this.hiddenPaymentsContract.getAddress();

    // validate and select the input ERC20 amount that matches the token and is approved for the relay adapt
    const { unusedERC20Amounts } = this.getValidInputERC20Amount(
      erc20Amounts,
      (erc20Amount) =>
        compareERC20Info(erc20Amount, this.tokenInfo) &&
        erc20Amount.approvedSpender?.toLowerCase() ===
          this.spender.toLowerCase(),
      0n
    );

    const crossContractCalls: ContractTransaction[] = [];

    // After unshielding, WETH is already in the Relay Adapt contract (NETWORK_CONFIG.proxyContract)
    // We just need to:
    // 1. Approve HiddenPayments contract to spend Relay Adapt's WETH
    // 2. Call top_up, which will pull the WETH using transferFrom

    // Use the actual input amount from the previous step (after any fees/deductions)
    const actualAmount = unusedERC20Amounts[0].expectedBalance;

    // 1. Approve HiddenPayments contract to spend relay adapt's WETH.
    crossContractCalls.push(
      await this.wethContractHelper.createSpenderApproval(
        await this.hiddenPaymentsContract.getAddress(),
        actualAmount
      )
    );

    // 2. Call top_up on HiddenPayments contract (will pull WETH from msg.sender = Relay Adapt).
    crossContractCalls.push(
      await this.hiddenPaymentsContract.top_up.populateTransaction(actualAmount)
    );

    // The input amount is fully spent in this step.
    const spentERC20Amount: RecipeERC20AmountRecipient = {
      amount: actualAmount,
      decimals: this.tokenInfo.decimals,
      tokenAddress: this.tokenInfo.tokenAddress,
      recipient: hiddenPaymentsContractAddress,
    };

    return {
      crossContractCalls,
      spentERC20Amounts: [spentERC20Amount],
      outputERC20Amounts: [],
      spentNFTs: [],
      outputNFTs: nfts,
      feeERC20AmountRecipients: [],
    };
  }
}
