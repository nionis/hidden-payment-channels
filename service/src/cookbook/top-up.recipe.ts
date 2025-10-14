import type { Provider } from "ethers";
import {
  type Step,
  type RecipeERC20Info,
  ApproveERC20SpenderStep,
  Recipe,
  ERC20Contract,
} from "@railgun-community/cookbook";
import TopUpStep from "./top-up.step";
import { getHiddenPaymentsContract } from "../contract";
import { NETWORK_CONFIG } from "../env";

export default class TopUpRecipe extends Recipe {
  readonly config = {
    name: "HiddenPayments TopUp Recipe",
    description: "Top up HiddenPayments contract from a railgun wallet.",
    minGasLimit: 2_500_000n,
  };

  constructor(
    private readonly provider: Provider,
    private readonly tokenInfo: RecipeERC20Info
  ) {
    super();
  }

  protected supportsNetwork(): boolean {
    return true;
  }

  protected async getInternalSteps(): Promise<Step[]> {
    const railgunContractAddress = NETWORK_CONFIG.proxyContract;
    const hiddenPaymentsContract = await getHiddenPaymentsContract(
      this.provider
    );
    const wethContractHelper = new ERC20Contract(
      NETWORK_CONFIG.baseToken.wrappedAddress,
      this.provider as any
    );

    return [
      new ApproveERC20SpenderStep(railgunContractAddress, this.tokenInfo),
      new TopUpStep(
        hiddenPaymentsContract,
        wethContractHelper,
        railgunContractAddress,
        this.tokenInfo
      ),
    ];
  }
}
