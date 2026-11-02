import type { Locale } from "../config";
import { auth as enAuth } from "./en/auth";
import { automations as enAutomations } from "./en/automations";
import { billing as enBilling } from "./en/billing";
import { calendar as enCalendar } from "./en/calendar";
import { clients as enClients } from "./en/clients";
import { common as enCommon } from "./en/common";
import { dashboard as enDashboard } from "./en/dashboard";
import { inbox as enInbox } from "./en/inbox";
import { legal as enLegal } from "./en/legal";
import { marketing as enMarketing } from "./en/marketing";
import { modules as enModules } from "./en/modules";
import { onboarding as enOnboarding } from "./en/onboarding";
import { shell as enShell } from "./en/shell";
import { staff as enStaff } from "./en/staff";
import { auth as sqAuth } from "./sq/auth";
import { automations as sqAutomations } from "./sq/automations";
import { billing as sqBilling } from "./sq/billing";
import { calendar as sqCalendar } from "./sq/calendar";
import { clients as sqClients } from "./sq/clients";
import { common as sqCommon } from "./sq/common";
import { dashboard as sqDashboard } from "./sq/dashboard";
import { inbox as sqInbox } from "./sq/inbox";
import { legal as sqLegal } from "./sq/legal";
import { marketing as sqMarketing } from "./sq/marketing";
import { modules as sqModules } from "./sq/modules";
import { onboarding as sqOnboarding } from "./sq/onboarding";
import { shell as sqShell } from "./sq/shell";
import { staff as sqStaff } from "./sq/staff";
import type { Translation } from "./types";

const en = {
  common: enCommon,
  marketing: enMarketing,
  modules: enModules,
  billing: enBilling,
  legal: enLegal,
  auth: enAuth,
  onboarding: enOnboarding,
  shell: enShell,
  dashboard: enDashboard,
  calendar: enCalendar,
  clients: enClients,
  staff: enStaff,
  inbox: enInbox,
  automations: enAutomations,
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
  onboarding: sqOnboarding,
  shell: sqShell,
  dashboard: sqDashboard,
  calendar: sqCalendar,
  clients: sqClients,
  staff: sqStaff,
  inbox: sqInbox,
  automations: sqAutomations,
};

export const messages: Record<Locale, Messages> = { en, sq };
