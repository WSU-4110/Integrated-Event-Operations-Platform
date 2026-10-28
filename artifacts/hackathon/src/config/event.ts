export const EVENT_CONFIG = {
  name: "BuilderWars Hackathon",
  tagline: "Build the future in 24 hours.",
  date: "November 14–15, 2026",
  location: "Newlab Detroit · 1st Floor",
  duration: "24 Hours",
  teamSize: "1–4 members",
  eligibility: "Currently enrolled college or university students",
  cost: "Free",
  // Hacking starts at noon Detroit time. Daylight saving time ends November 1,
  // so the event falls in Eastern Standard Time (UTC-5).
  targetDate: new Date("2026-11-14T12:00:00-05:00"),
  contactEmail: "awssbg@wayne.edu",
  mainWebsiteUrl: "https://www.wayneaws.dev/",
  discordInviteUrl: "https://discord.com/invite/mrYkakzvUj",
  socialLinks: {
    meetup: "https://www.meetup.com/aws-sbg-at-wayne-state-university/?eventOrigin=home_groups_you_organize",
    instagram: "https://www.instagram.com/builderwars.hack/",
    linkedin: "https://www.linkedin.com/company/aws-student-builder-group-wayne-state-university",
  },
};

export const SCHEDULE = [
  { time: "Sat · 10:00–11:30 AM", event: "Check-In & Breakfast", description: "Arrive at Newlab Detroit, check in, and enjoy breakfast before the event begins." },
  { time: "Sat · 11:30 AM–12:00 PM", event: "Opening Ceremony", description: "Welcome remarks, event rules, and the official kickoff." },
  { time: "Sat · 12:00 PM", event: "Hacking Officially Begins", description: "The official 24-hour hacking window begins." },
  { time: "Sat · 12:00–1:00 PM", event: "Team Matchmaking", description: "Meet collaborators or confirm your pre-formed team." },
  { time: "Sat · 1:00–2:00 PM", event: "Lunch", description: "Lunch is provided with dietary accommodations." },
  { time: "Sat · 2:00–3:00 PM", event: "Workshop/Speaker Event: TBD!", description: "A featured workshop or speaker session. Details to be announced." },
  { time: "Sat · 4:00–5:00 PM", event: "Workshop/Speaker Event: TBD!", description: "A featured workshop or speaker session. Details to be announced." },
  { time: "Sat · 6:00–7:00 PM", event: "Workshop/Speaker Event: TBD!", description: "A featured workshop or speaker session. Details to be announced." },
  { time: "Sat · 7:30 PM", event: "Dinner", description: "Dinner is provided with dietary accommodations." },
  { time: "Sat · 10:00 PM", event: "Building Entry Closes", description: "No new entry until 7:00 AM Sunday. Participants already inside can stay overnight." },
  { time: "Sun · 7:00 AM", event: "Doors Reopen", description: "Entry opens again for the final stretch." },
  { time: "Sun · 8:30 AM", event: "Breakfast", description: "Breakfast is provided with dietary accommodations." },
  { time: "Sun · 11:00 AM–12:00 PM", event: "Last Hour for Hacking", description: "Use the final hour to polish and prepare your submission." },
  { time: "Sun · 12:00 PM", event: "Hacking Ends · Project Submission Deadline", description: "Hacking ends and completed projects must be submitted to Shipyard. Late submissions cannot be accepted." },
  { time: "Sun · 12:00–12:30 PM", event: "Lunch", description: "Lunch is provided with dietary accommodations." },
  { time: "Sun · 12:30–2:30 PM", event: "Presentations & Judging", description: "Teams present their work while judges review submissions." },
  { time: "Sun · 2:30–3:00 PM", event: "Closing Ceremony & Awards", description: "Celebrate the teams and announce the winners." },
];

export const FAQ = [
  { q: "Who can participate?", a: "BuilderWars is open to currently enrolled college or university students, at Wayne State or elsewhere, of any skill level. You do not need to be a computer science major." },
  { q: "Do I need coding experience?", a: "Some technical background is helpful, but beginners are welcome! Mentors will be on site throughout the event to help you get unstuck." },
  { q: "How large can teams be?", a: "Teams can have 1 to 4 members. You can register solo and find teammates at the Team Matchmaking session." },
  { q: "Is the hackathon free?", a: "Yes! Participation is completely free. We will provide meals, snacks, and drinks for the duration of the event." },
  { q: "What should I bring?", a: "Bring your laptop, charger, and any hardware you plan to use. We recommend bringing a sleeping bag if you plan to stay overnight." },
  { q: "Can beginners participate?", a: "Absolutely. We welcome participants of all experience levels, and mentors will be available to help you and your team along the way." },
  { q: "What can we build?", a: "You can build anything — a web app, mobile app, hardware project, AI tool, or any creative technical solution. Company-specific tracks will be announced before the event, and the top 3 projects overall win prizes separate from the company tracks." },
];
