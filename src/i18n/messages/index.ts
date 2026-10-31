import type { Locale } from "../config";
import { common as enCommon } from "./en/common";
import { marketing as enMarketing } from "./en/marketing";
import { modules as enModules } from "./en/modules";
import { common as sqCommon } from "./sq/common";
import { marketing as sqMarketing } from "./sq/marketing";
import { modules as sqModules } from "./sq/modules";
import type { Translation } from "./types";

const en = {
  common: enCommon,
  marketing: enMarketing,
  modules: enModules,
};

export type Messages = Translation<typeof en>;

export type Namespace = keyof Messages;

const sq: Messages = {
  common: sqCommon,
  marketing: sqMarketing,
  modules: sqModules,
};

export const messages: Record<Locale, Messages> = { en, sq };
