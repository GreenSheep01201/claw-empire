import { WORKFLOW_PACK_KEYS, type MessengerChannelType, type WorkflowPackKey } from "../../../types";

export const CHANNEL_META: Record<
  MessengerChannelType,
  {
    label: string;
    targetHint: string;
    transportReady: boolean;
  }
> = {
  telegram: { label: "Telegram", targetHint: "chat_id", transportReady: true },
  whatsapp: {
    label: "WhatsApp",
    targetHint: "phone_number_id:recipient (例: 1234567890:+8210...)",
    transportReady: true,
  },
  discord: { label: "Discord", targetHint: "channel_id", transportReady: true },
  googlechat: {
    label: "Google Chat",
    targetHint: "spaces/AAA... (tokenはwebhook URLまたはkey|token)",
    transportReady: true,
  },
  slack: { label: "Slack", targetHint: "channel_id", transportReady: true },
  signal: { label: "Signal", targetHint: "+8210..., group:<id>, username:<id>", transportReady: true },
  imessage: { label: "iMessage", targetHint: "電話番号/メールアドレス (macOS Messages)", transportReady: true },
};

const WORKFLOW_PACK_KEY_SET = new Set<string>(WORKFLOW_PACK_KEYS as readonly string[]);

export function isWorkflowPackKey(value: unknown): value is WorkflowPackKey {
  return typeof value === "string" && WORKFLOW_PACK_KEY_SET.has(value);
}

export function channelTargetHint(channel: MessengerChannelType): string {
  return CHANNEL_META[channel].targetHint;
}
