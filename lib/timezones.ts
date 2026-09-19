export const STATE_TIMEZONES: Record<string, string> = {
  Alabama: "America/Chicago",
  Alaska: "America/Anchorage",
  Arizona: "America/Phoenix",
  Arkansas: "America/Chicago",
  California: "America/Los_Angeles",
  Colorado: "America/Denver",
  Connecticut: "America/New_York",
  Delaware: "America/New_York",
  Florida: "America/New_York",
  Georgia: "America/New_York",
  Hawaii: "Pacific/Honolulu",
  Idaho: "America/Boise",
  Illinois: "America/Chicago",
  Indiana: "America/Indiana/Indianapolis",
  Iowa: "America/Chicago",
  Kansas: "America/Chicago",
  Kentucky: "America/New_York",
  Louisiana: "America/Chicago",
  Maine: "America/New_York",
  Maryland: "America/New_York",
  Massachusetts: "America/New_York",
  Michigan: "America/Detroit",
  Minnesota: "America/Chicago",
  Mississippi: "America/Chicago",
  Missouri: "America/Chicago",
  Montana: "America/Denver",
  Nebraska: "America/Chicago",
  Nevada: "America/Los_Angeles",
  "New Hampshire": "America/New_York",
  "New Jersey": "America/New_York",
  "New Mexico": "America/Denver",
  "New York": "America/New_York",
  "North Carolina": "America/New_York",
  "North Dakota": "America/Chicago",
  Ohio: "America/New_York",
  Oklahoma: "America/Chicago",
  Oregon: "America/Los_Angeles",
  Pennsylvania: "America/New_York",
  "Rhode Island": "America/New_York",
  "South Carolina": "America/New_York",
  "South Dakota": "America/Chicago",
  Tennessee: "America/Chicago",
  Texas: "America/Chicago",
  Utah: "America/Denver",
  Vermont: "America/New_York",
  Virginia: "America/New_York",
  Washington: "America/Los_Angeles",
  "West Virginia": "America/New_York",
  Wisconsin: "America/Chicago",
  Wyoming: "America/Denver",
  "District of Columbia": "America/New_York",
};

const CITY_OVERRIDES: Record<string, string> = {
  // Florida Panhandle
  Pensacola: "America/Chicago",
  "Panama City": "America/Chicago",
  Destin: "America/Chicago",
  "Fort Walton Beach": "America/Chicago",

  // Western Kentucky
  "Bowling Green": "America/Chicago",
  Paducah: "America/Chicago",

  // Eastern Tennessee
  Knoxville: "America/New_York",
  Chattanooga: "America/New_York",
  "Johnson City": "America/New_York",

  // Northern Idaho
  "Coeur d'Alene": "America/Los_Angeles",
  Lewiston: "America/Los_Angeles",

  // Eastern Oregon
  Ontario: "America/Boise",

  // Western Nebraska
  Scottsbluff: "America/Denver",

  // Western Kansas
  Goodland: "America/Denver",

  // Western North Dakota
  Dickinson: "America/Denver",

  // Western South Dakota
  "Rapid City": "America/Denver",

  // Far west Texas
  "El Paso": "America/Denver",
};

export function explicitTimezoneToIana(
  timezoneText: string | null
): string | null {
  if (!timezoneText) {
    return null;
  }

  const lower = timezoneText.toLowerCase();

  if (lower.includes("eastern")) {
    return "America/New_York";
  }

  if (lower.includes("central")) {
    return "America/Chicago";
  }

  if (lower.includes("mountain")) {
    return "America/Denver";
  }

  if (lower.includes("pacific")) {
    return "America/Los_Angeles";
  }

  return null;
}

export function getMeetingTimezone(
  city: string | null,
  state: string | null,
  explicitTimezone: string | null
): string | null {
  // Explicit timezone listed by GA wins.
  const explicit =
    explicitTimezoneToIana(explicitTimezone);

  if (explicit) {
    return explicit;
  }

  // Then check known city exceptions.
  if (city && CITY_OVERRIDES[city]) {
    return CITY_OVERRIDES[city];
  }

  // Otherwise use the state's primary timezone.
  if (state && STATE_TIMEZONES[state]) {
    return STATE_TIMEZONES[state];
  }

  return null;
}