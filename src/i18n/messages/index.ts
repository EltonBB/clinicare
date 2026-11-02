import type { Locale } from "../config";
import { auth as enAuth } from "./en/auth";
import { billing as enBilling } from "./en/billing";
import { common as enCommon } from "./en/common";
import { legal as enLegal } from "./en/legal";
import { marketing as enMarketing } from "./en/marketing";
import { modules as enModules } from "./en/modules";
import { auth as sqAuth } from "./sq/auth";
import { billing as sqBilling } from "./sq/billing";
import { common as sqCommon } from "./sq/common";
import { legal as sqLegal } from "./sq/legal";
import { marketing as sqMarketing } from "./sq/marketing";
import { modules as sqModules } from "./sq/modules";
import type { Translation } from "./types";

const en = {
  common: enCommon,
  marketing: enMarketing,
  modules: enModules,
  billing: enBilling,
  legal: enLegal,
  auth: enAuth,
};

export type Messages = Translation<typeof en>;

export type Namespace = keyof Messages;

const sq: Messages = {
  common: sqCommon,
  marketing: sqMarketing,
  modules: sqModules,
  billing: sqBilling,
  legal: sqLegal,
  auth: sqAuth,
};

export const messages: Record<Locale, Messages> = { en, sq };
