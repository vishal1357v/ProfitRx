import { ActionType } from "../../decision-engine/types";
import { ActionExecutor } from "../executors/executor.interface";
import { AllowCodExecutor } from "../executors/allow-cod.executor";
import { OtpExecutor } from "../executors/otp.executor";
import { WhatsappExecutor } from "../executors/whatsapp.executor";
import { PartialPaymentExecutor } from "../executors/partial-payment.executor";
import { PrepaidExecutor } from "../executors/prepaid.executor";
import { CodBlockExecutor } from "../executors/cod-block.executor";
import { RealOtpProvider } from "../providers/otp/real.otp-provider";
import { RealWhatsappProvider } from "../providers/whatsapp/real.whatsapp-provider";

export class ExecutorRegistry {
  private static executors: Map<ActionType, ActionExecutor> = new Map([
    ["ALLOW_COD", new AllowCodExecutor()],
    ["OTP_VERIFY", new OtpExecutor(new RealOtpProvider())],
    ["WHATSAPP_VERIFY", new WhatsappExecutor(new RealWhatsappProvider())],
    ["PARTIAL_PAYMENT", new PartialPaymentExecutor()],
    ["PREPAID_ONLY", new PrepaidExecutor()],
    ["BLOCK_COD", new CodBlockExecutor()]
  ]);

  static get(action: ActionType): ActionExecutor {
    const executor = this.executors.get(action);
    if (!executor) {
      throw new Error(`No executor registered for action type: ${action}`);
    }
    return executor;
  }

  static register(action: ActionType, executor: ActionExecutor): void {
    this.executors.set(action, executor);
  }
}
