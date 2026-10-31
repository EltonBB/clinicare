import type { Locale } from "../config";
import { common as enCommon } from "./en/common";
import { common as sqCommon } from "./sq/common";
import type { Translation } from "./types";

const en = {
  common: enCommon,
};

export type Messages = Translation<typeof en>;

export type Namespace = keyof Messages;

const sq: Messages = {
  common: sqCommon,
};

export const messages: Record<Locale, Messages> = { en, sq };
