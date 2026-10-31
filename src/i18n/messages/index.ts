import type { Locale } from "../config";
import { billing as enBilling } from "./en/billing";
import { common as enCommon } from "./en/common";
import { marketing as enMarketing } from "./en/marketing";
import { modules as enModules } from "./en/modules";
import { billing as sqBilling } from "./sq/billing";
import { common as sqCommon } from "./sq/common";
import { marketing as sqMarketing } from "./sq/marketing";
import { modules as sqModules } from "./sq/modules";
import type { Translation } from "./types";

const en = {
  common: enCommon,
  marketing: enMarketing,
  modules: enModules,
  billing: enBilling,
};

export type Messages = Translation<typeof en>;

export type Namespace = keyof Messages;

const sq: Messages = {
  common: sqCommon,
  marketing: sqMarketing,
  modules: sqModules,
  billing: sqBilling,
};

export const messages: Record<Locale, Messages> = { en, sq };
