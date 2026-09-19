import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  getUpcomingMeetings,
} from "../../../lib/meetings";

export async function GET(
  request: NextRequest
) {
  try {
    const hoursParam =
      request.nextUrl.searchParams.get(
        "hours"
      );

    let hours =
      Number(
        hoursParam ?? 12
      );

    if (
      !Number.isFinite(hours) ||
      hours <= 0
    ) {
      hours = 12;
    }

    /*
     * Prevent somebody from asking
     * our scraper for an absurdly
     * large window.
     */
    hours =
      Math.min(
        hours,
        48
      );

    const meetings =
      await getUpcomingMeetings(
        hours
      );

    return NextResponse.json({
      success: true,

      generatedAt:
        new Date().toISOString(),

      windowHours:
        hours,

      count:
        meetings.length,

      meetings,
    });
  } catch (error) {
    console.error(
      "Meeting API failed:",
      error
    );

    return NextResponse.json(
      {
        success: false,

        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}