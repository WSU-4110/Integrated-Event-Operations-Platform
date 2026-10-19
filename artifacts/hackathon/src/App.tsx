import { useEffect, useMemo, useState } from "react";
import type { ReactNode, ChangeEvent, FormEvent } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAuth } from "@workspace/replit-auth-web";
import {
  useCheckRegistration,
  useDeleteRegistration,
  useResendConfirmation,
  useGetAdminStats,
  useListRegistrations,
  useSubmitRegistration,
  getCheckRegistrationQueryKey,
  getGetAdminStatsQueryKey,
  getListRegistrationsQueryKey,
} from "@workspace/api-client-react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  Code2,
  Download,
  ExternalLink,
  FileText,
  Flag,
  Gift,
  GraduationCap,
  Instagram,
  Linkedin,
  Loader2,
  LocateFixed,
  Mail,
  Menu,
  Monitor,
  Network,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react";
import logoPrimary from "@assets/brand/builderwars-primary.svg";
import logoSecondary from "@assets/brand/builderwars-secondary.svg";
import logoSubmark from "@assets/brand/builderwars-submark.svg";
import informationPacket from "@assets/BuilderWars_Information_Packet.pdf";
import sponsorshipPacket from "@assets/BuilderWars_Sponsorship_Packet.pdf";
import awsLogo from "@assets/sponsors/aws.png";
import freeWiliLogo from "@assets/sponsors/free-wili.webp";
import essLogo from "@assets/sponsors/wsu-engineering-student-senate.png";
import { Switch, Route } from "wouter";
import { EVENT_CONFIG, FAQ, SCHEDULE } from "@/config/event";
import NotFound from "@/pages/not-found";
import "./index.css";

const queryClient = new QueryClient();
const nav = [
  ["About", "#about"],
  ["Schedule", "#schedule"],
  ["Prizes", "#prizes"],
  ["Sponsors", "#sponsors"],
  ["FAQ", "#faq"],
];
const Icon = ({ children }: { children: ReactNode }) => (
  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#111418] text-[#a78bfa]">
    {children}
  </span>
);
const Divider = ({ icon }: { icon: ReactNode }) => (
  <div className="divider">{icon}</div>
);
function Header() {
  const [open, setOpen] = useState(false);
  return (
    <header className="fixed top-0 z-50 w-full border-b border-[#292e36]/80 bg-[#111418]/90 backdrop-blur-xl">
      <div className="container-shell relative flex h-[72px] items-center justify-between">
        <div className="flex items-center gap-5">
          <a
            href="https://www.wayneaws.dev/events"
            className="flex items-center gap-1.5 text-xs text-[#7d848e] transition hover:text-[#a78bfa]"
            data-testid="link-student-hub"
          >
            <ArrowLeft size={13} />
            Student Hub
          </a>
          <a
            href="#top"
            className="flex items-center text-sm font-bold tracking-[.14em] text-[#a78bfa]"
            data-testid="link-logo"
          >
            <img
              src={logoSecondary}
              alt="BuilderWars"
              className="h-5 w-auto sm:h-6"
            />
          </a>
        </div>
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 md:flex">
          {nav.map(([label, href], i) => (
            <a
              key={href}
              href={href}
              className={`relative py-6 text-sm text-[#9ca3af] transition hover:text-[#a78bfa] ${i === 0 ? "text-[#a78bfa]" : ""}`}
              data-testid={`link-nav-${label.toLowerCase()}`}
            >
              {label}
              {i === 0 && (
                <span className="absolute bottom-[17px] left-0 right-0 mx-auto h-px bg-[#a78bfa]" />
              )}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-3 md:flex">
          <a
            href="#register"
            className="btn btn-primary !min-h-[38px]"
            data-testid="link-join-header"
          >
            Register
          </a>
        </div>
        <button
          className="text-[#a78bfa] md:hidden"
          onClick={() => setOpen(!open)}
          data-testid="button-mobile-menu"
        >
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="border-t border-[#292e36] bg-[#111418] p-6 md:hidden">
          <nav className="flex flex-col gap-5">
            {nav.map(([label, href]) => (
              <a
                key={href}
                href={href}
                onClick={() => setOpen(false)}
                className="text-lg text-[#e7e5df]"
                data-testid={`link-mobile-${label.toLowerCase()}`}
              >
                {label}
              </a>
            ))}
            <a
              href="#register"
              onClick={() => setOpen(false)}
              className="btn btn-primary"
              data-testid="link-mobile-join"
            >
              Register
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}
function Countdown() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, EVENT_CONFIG.targetDate.getTime() - now.getTime());
  const values = [
    Math.floor(diff / 86400000),
    Math.floor(diff / 3600000) % 24,
    Math.floor(diff / 60000) % 60,
    Math.floor(diff / 1000) % 60,
  ];
  return (
    <div className="mt-12">
      <p className="eyebrow mb-4 text-center">The clock is already running</p>
      <div className="mx-auto grid max-w-[510px] grid-cols-4 gap-2 sm:gap-3">
        {values.map((v, i) => (
          <div className="panel px-2 py-4 text-center" key={i}>
            <strong
              className="block font-mono text-2xl font-semibold tracking-tight text-[#a78bfa] sm:text-3xl"
              data-testid={`text-countdown-${i}`}
            >
              {String(v).padStart(2, "0")}
            </strong>
            <span className="mt-1 block text-[10px] uppercase tracking-[.15em] text-[#7d848e]">
              {["Days", "Hours", "Minutes", "Seconds"][i]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
function Hero() {
  return (
    <section
      id="top"
      className="relative flex min-h-[760px] items-center overflow-hidden pt-20"
    >
      <div className="glow -left-32 top-16 h-80 w-80" />
      <div className="glow right-[-90px] top-28 h-[420px] w-[420px]" />
      <div className="glow left-[38%] top-[42%] h-64 w-64" />
      <div className="glow bottom-[-100px] left-[10%] h-72 w-72" />
      <div className="glow bottom-[-80px] right-[15%] h-64 w-64" />
      <div className="container-shell relative text-center">
        <p className="eyebrow">The build starts here</p>
        <h1 className="mx-auto mt-8 w-[min(100%,420px)]">
          <img
            src={logoPrimary}
            alt="BuilderWars Hackathon"
            className="h-auto w-full"
          />
        </h1>
        <p className="mt-7 text-lg font-semibold tracking-wide text-[#a78bfa] sm:text-xl">
          {EVENT_CONFIG.tagline}
        </p>
        <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#9ca3af]">
          A high-stakes sprint for curious minds, brave ideas, and the teams
          that refuse to ship ordinary. Hosted by the AWS Student Builder Group
          at Wayne State University.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-5 text-sm text-[#9ca3af]">
          <span className="flex items-center gap-2">
            <CalendarDays size={16} className="text-[#a78bfa]" />
            {EVENT_CONFIG.date}
          </span>
          <span className="hidden h-5 w-px bg-[#343941] sm:block" />
          <span className="flex items-center gap-2">
            <LocateFixed size={16} className="text-[#a78bfa]" />
            {EVENT_CONFIG.location}
          </span>
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a
            href="#register"
            className="btn btn-primary"
            data-testid="link-hero-join"
          >
            Register <ArrowRight size={16} />
          </a>
          <a
            href="#about"
            className="btn btn-ghost"
            data-testid="link-hero-learn"
          >
            Learn More
          </a>
        </div>
        <Countdown />
      </div>
      <a
        href="#about"
        className="absolute bottom-8 left-1/2 flex -translate-x-1/2 flex-col items-center gap-2 text-[10px] tracking-[.25em] text-[#7d848e]"
        data-testid="link-explore"
      >
        EXPLORE <ArrowDown size={15} className="float text-[#a78bfa]" />
      </a>
    </section>
  );
}
function SectionHeading({
  label,
  title,
  copy,
  icon,
}: {
  label: string;
  title: string;
  copy: string;
  icon: ReactNode;
}) {
  return (
    <div className="section-heading">
      <Divider icon={icon} />
      <p className="eyebrow mt-5">{label}</p>
      <h2 className="display text-[#f7f4ed]">{title}</h2>
      <p>{copy}</p>
    </div>
  );
}
const info = [
  ["Date", EVENT_CONFIG.date, CalendarDays],
  ["Location", EVENT_CONFIG.location, LocateFixed],
  ["Duration", EVENT_CONFIG.duration, Clock3],
  ["Team Size", EVENT_CONFIG.teamSize, Users],
  ["Eligibility", EVENT_CONFIG.eligibility, GraduationCap],
  ["Cost", EVENT_CONFIG.cost, Trophy],
] as const;
function About() {
  return (
    <>
      <section id="about" className="section">
        <div className="container-shell">
          <SectionHeading
            label="01 / THE BRIEF"
            title="Make something worth remembering."
            copy="This is not a conference. It is a focused, generous 24-hour window to turn a sharp idea into a working reality."
            icon={<Code2 size={17} />}
          />
          <div className="grid gap-4 md:grid-cols-3">
            {[
              [
                "What Is It",
                "A concentrated build sprint where ambition has a deadline and every team leaves with a story.",
                Monitor,
              ],
              [
                "Who Is It For",
                "Currently enrolled college or university students who are passionate about development and career readiness.",
                Users,
              ],
              [
                "Why Participate",
                "Find your people, meet working mentors, and put a real artifact in the world.",
                Flag,
              ],
            ].map(([t, d, I], i) => (
              <article
                className="panel p-6"
                key={t as string}
                data-testid={`card-about-${i}`}
              >
                <Icon>
                  <I size={19} />
                </Icon>
                <h3 className="mt-7 text-lg font-semibold text-[#f7f4ed]">
                  {t as string}
                </h3>
                <p className="mt-3 text-sm leading-7 text-[#9ca3af]">
                  {d as string}
                </p>
              </article>
            ))}
          </div>
          <div className="mt-14 grid grid-cols-3 divide-x divide-[#2a3039] text-center">
            <div>
              <b className="font-mono text-3xl text-[#a78bfa] sm:text-5xl">
                24
              </b>
              <p className="mt-2 text-xs uppercase tracking-[.18em] text-[#7d848e]">
                Hours
              </p>
            </div>
            <div>
              <b className="font-mono text-3xl text-[#a78bfa] sm:text-5xl">
                1–4
              </b>
              <p className="mt-2 text-xs uppercase tracking-[.18em] text-[#7d848e]">
                Teammates
              </p>
            </div>
            <div>
              <b className="font-mono text-3xl text-[#a78bfa] sm:text-5xl">
                $0
              </b>
              <p className="mt-2 text-xs uppercase tracking-[.18em] text-[#7d848e]">
                To enter
              </p>
            </div>
          </div>
          <div className="mt-8 text-center">
            <a
              href={informationPacket}
              target="_blank"
              rel="noreferrer"
              className="btn btn-ghost"
              data-testid="link-event-information-packet"
            >
              <FileText size={16} />
              Read the event information packet <ExternalLink size={14} />
            </a>
          </div>
        </div>
      </section>
      <section
        id="details"
        className="section border-y border-[#252a32] bg-[#15191f]"
      >
        <div className="container-shell">
          <SectionHeading
            label="02 / KNOW BEFORE YOU GO"
            title="The useful details."
            copy="Everything you need to decide if this is your weekend."
            icon={<FileText size={17} />}
          />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {info.map(([t, v, I]) => (
              <div className="panel flex gap-4 p-5" key={t}>
                <Icon>
                  <I size={18} />
                </Icon>
                <div>
                  <p className="eyebrow !text-[10px]">{t}</p>
                  <p className="mt-2 text-sm leading-6 text-[#e7e5df]">{v}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
function Schedule() {
  const dayOne = SCHEDULE.filter((item) => item.time.startsWith("Sat"));
  const dayTwo = SCHEDULE.filter((item) => item.time.startsWith("Sun"));
  const Timeline = ({ items }: { items: typeof SCHEDULE }) => (
    <>
      {items.map((item, i) => (
        <div
          className="grid grid-cols-[105px_26px_1fr] gap-3 sm:grid-cols-[150px_32px_1fr] sm:gap-4"
          key={`${item.time}-${item.event}`}
        >
          <div className="pt-1 text-right font-mono text-[10px] leading-5 text-[#a78bfa] sm:text-xs">
            {item.time}
          </div>
          <div className="relative flex justify-center">
            <span className="z-10 mt-1 h-3 w-3 rounded-full border-2 border-[#a78bfa] bg-[#111418]" />
            <span
              className={`absolute top-4 h-full w-px bg-[#2d2840] ${i === items.length - 1 ? "hidden" : ""}`}
            />
          </div>
          <article className="panel mb-4 p-4 sm:p-5">
            <h3 className="font-semibold text-[#f7f4ed]">{item.event}</h3>
            <p className="mt-2 text-sm leading-6 text-[#9ca3af]">
              {item.description}
            </p>
          </article>
        </div>
      ))}
    </>
  );
  return (
    <section id="schedule" className="section">
      <div className="container-shell">
        <SectionHeading
          label="03 / THE RUN OF SHOW"
          title="A deadline with rhythm."
          copy="Show up ready. We will take care of the momentum."
          icon={<CalendarDays size={17} />}
        />
        <div className="mx-auto max-w-3xl">
          <div>
            <p className="eyebrow mb-5">Day One · Saturday, November 14</p>
            <Timeline items={dayOne} />
          </div>
          <div className="mt-8 border-t border-[#3a4048] pt-8">
            <p className="eyebrow mb-5">Day Two · Sunday, November 15</p>
            <Timeline items={dayTwo} />
          </div>
        </div>
      </div>
    </section>
  );
}
function Prizes() {
  return (
    <section
      id="prizes"
      className="section border-y border-[#252a32] bg-[#15191f]"
    >
      <div className="container-shell">
        <SectionHeading
          label="04 / THE UPSIDE"
          title="Prizes."
          copy="Prizes for the top 3 projects overall, plus company-specific tracks. Details will be announced before the event."
          icon={<Gift size={17} />}
        />
        <div className="panel mx-auto max-w-3xl p-10 text-center">
          <p className="eyebrow">Prizes</p>
          <p className="mt-4 font-mono text-5xl text-[#a78bfa]">TBD</p>
        </div>
      </div>
    </section>
  );
}
const SPONSORS = [
  {
    id: "aws",
    name: "Amazon Web Services",
    url: "https://aws.amazon.com/",
    logo: awsLogo,
    logoClassName: "h-12 w-auto object-contain",
  },
  {
    id: "free-wili",
    name: "FREE WILI",
    url: "https://freewili.com/",
    logo: freeWiliLogo,
    logoClassName: "h-16 w-auto object-contain",
  },
  {
    id: "wsu-ess",
    name: "Wayne State Engineering Student Senate",
    url: "https://www.instagram.com/wsu_ess/",
    logo: essLogo,
    logoClassName: "h-20 w-20 rounded-full object-cover",
  },
];
function Sponsors() {
  return (
    <section id="sponsors" className="section">
      <div className="container-shell">
        <SectionHeading
          label="05 / BACKED BY"
          title="Our sponsors."
          copy="These partners help make the build possible. More sponsors will be announced soon."
          icon={<Network size={17} />}
        />
        <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
          {SPONSORS.map((sponsor) => {
            const content = (
              <>
                <div className="flex h-20 items-center justify-center">
                  <img
                    src={sponsor.logo}
                    alt={`${sponsor.name} logo`}
                    className={sponsor.logoClassName}
                  />
                </div>
                <p className="mt-4 text-sm font-semibold text-[#f7f4ed]">
                  {sponsor.name}
                  {sponsor.url && (
                    <ExternalLink
                      size={12}
                      className="ml-1.5 inline text-[#a78bfa]"
                    />
                  )}
                </p>
              </>
            );
            const className =
              "panel flex min-h-[170px] flex-col items-center justify-center p-6 text-center";
            return sponsor.url ? (
              <a
                key={sponsor.name}
                href={sponsor.url}
                target="_blank"
                rel="noreferrer"
                className={`${className} transition hover:border-[#a78bfa]/50`}
                data-testid={`link-sponsor-${sponsor.id}`}
              >
                {content}
              </a>
            ) : (
              <div
                key={sponsor.name}
                className={className}
                data-testid={`card-sponsor-${sponsor.id}`}
              >
                {content}
              </div>
            );
          })}
          <div className="panel flex min-h-[170px] items-center justify-center p-6 text-center">
            <div>
              <p className="eyebrow">More sponsors</p>
              <p className="mt-3 text-sm text-[#9ca3af]">To be announced</p>
            </div>
          </div>
        </div>
        <div className="panel mx-auto mt-10 flex max-w-3xl flex-col items-start justify-between gap-5 p-6 sm:flex-row sm:items-center">
          <div>
            <p className="eyebrow">Interested in partnering?</p>
            <p className="mt-2 text-sm leading-6 text-[#9ca3af]">
              Explore sponsorship packages and ways to support the next
              generation of cloud talent at Wayne State.
            </p>
          </div>
          <a
            href={sponsorshipPacket}
            target="_blank"
            rel="noreferrer"
            className="btn btn-primary shrink-0"
            data-testid="link-sponsorship-packet"
          >
            <FileText size={16} />
            View sponsorship packet <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </section>
  );
}
function Faq() {
  const [active, setActive] = useState<number | null>(null);
  return (
    <section
      id="faq"
      className="section border-y border-[#252a32] bg-[#15191f]"
    >
      <div className="container-shell">
        <SectionHeading
          label="06 / GOOD QUESTIONS"
          title="Before you commit."
          copy="The short version, without the fine print."
          icon={<FileText size={17} />}
        />
        <div className="mx-auto max-w-3xl">
          {FAQ.map((item, i) => (
            <div className="border-b border-[#2a3039]" key={item.q}>
              <button
                className="flex w-full items-center justify-between gap-5 py-5 text-left"
                onClick={() => setActive(active === i ? null : i)}
                data-testid={`button-faq-${i}`}
              >
                <span className="font-medium text-[#f7f4ed]">{item.q}</span>
                <ChevronDown
                  size={18}
                  className={`shrink-0 text-[#a78bfa] transition ${active === i ? "rotate-180" : ""}`}
                />
              </button>
              {active === i && (
                <p className="pb-5 pr-8 text-sm leading-7 text-[#9ca3af]">
                  {item.a}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
type RegistrationForm = {
  name: string;
  email: string;
  school: string;
  class_standing: "freshman" | "sophomore" | "junior" | "senior" | "graduate";
  experience_level: "beginner" | "intermediate" | "advanced" | "professional";
  discord_username: string;
  team_status: "" | "has_team" | "looking" | "solo";
  team_name: string;
};
const ALREADY_REGISTERED =
  "That email is already registered. Check your inbox for the confirmation, or contact awssbg@wayne.edu.";
function Registration() {
  const [form, setForm] = useState<RegistrationForm>({
    name: "",
    email: "",
    school: "",
    class_standing: "freshman",
    experience_level: "beginner",
    discord_username: "",
    team_status: "",
    team_name: "",
  });
  const [result, setResult] = useState<{ emailSent: boolean } | null>(null);
  const [error, setError] = useState("");
  const validEmail = /^[^\s@]+@[^\s@]+\.edu$/i.test(form.email);
  const check = useCheckRegistration(
    { email: form.email || "invalid@example.com" },
    {
      query: {
        enabled: validEmail,
        queryKey: getCheckRegistrationQueryKey({
          email: form.email || "invalid@example.com",
        }),
      },
    },
  );
  const submit = useSubmitRegistration();
  const change = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm({ ...form, [e.target.name]: e.target.value });
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (
      !form.name.trim() ||
      !form.school.trim() ||
      !validEmail ||
      form.discord_username.trim().length < 2 ||
      !form.team_status
    ) {
      setError(
        "Please complete every required field and use your .edu email address.",
      );
      return;
    }
    if (check.data?.registered) {
      setError(ALREADY_REGISTERED);
      return;
    }
    submit.mutate(
      {
        data: {
          name: form.name,
          email: form.email,
          school: form.school,
          class_standing: form.class_standing,
          experience_level: form.experience_level,
          discord_username: form.discord_username,
          team_status: form.team_status,
          team_name:
            form.team_status === "has_team" ? form.team_name || null : null,
        },
      },
      {
        onSuccess: (data) =>
          setResult({ emailSent: data.confirmation_email_sent }),
        onError: (err) =>
          setError(
            getApiErrorStatus(err) === 409
              ? ALREADY_REGISTERED
              : "We couldn't save your registration. Please try again.",
          ),
      },
    );
  };
  return (
    <section id="register" className="section">
      <div className="container-shell">
        <SectionHeading
          label="07 / YOUR MOVE"
          title="Register for BuilderWars."
          copy="Free for currently enrolled college and university students. Organizers review every registration."
          icon={<Mail size={17} />}
        />
        <div className="panel mx-auto max-w-2xl p-6 sm:p-9">
          {result ? (
            <div className="py-12 text-center" data-testid="status-registered">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#7c3aed] text-white">
                <Check size={26} />
              </div>
              <h3 className="display mt-6 text-3xl text-[#f7f4ed]">
                You're registered.
              </h3>
              <p className="mx-auto mt-3 max-w-md text-[#9ca3af]">
                Your registration is pending. We'll email you once an organizer
                approves it, with how to get access to the participant Discord
                channels.
              </p>
              <p className="mx-auto mt-3 max-w-md text-sm text-[#7d848e]">
                {result.emailSent
                  ? "A confirmation with the information packet is on its way. If it isn't in your school inbox within a few minutes, check your junk or spam folder, and mark it as not junk so our next emails reach you. Questions? Email awssbg@wayne.edu."
                  : "We couldn't send your confirmation email right away, but your registration is saved. If no email arrives, contact awssbg@wayne.edu."}
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="grid gap-5 sm:grid-cols-2">
              <label className="sm:col-span-2">
                <span className="eyebrow !text-[10px]">Full name *</span>
                <input
                  name="name"
                  value={form.name}
                  onChange={change}
                  placeholder="Your name"
                  autoComplete="name"
                  className="field"
                  data-testid="input-name"
                />
              </label>
              <label>
                <span className="eyebrow !text-[10px]">
                  School email * (.edu)
                </span>
                <input
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={change}
                  placeholder="you@university.edu"
                  autoComplete="email"
                  className="field"
                  data-testid="input-email"
                />
              </label>
              <label>
                <span className="eyebrow !text-[10px]">School *</span>
                <input
                  name="school"
                  value={form.school}
                  onChange={change}
                  placeholder="Your college or university"
                  className="field"
                  data-testid="input-school"
                />
              </label>
              <label>
                <span className="eyebrow !text-[10px]">Class standing *</span>
                <select
                  name="class_standing"
                  value={form.class_standing}
                  onChange={change}
                  className="field"
                  data-testid="select-class-standing"
                >
                  <option value="freshman">Freshman</option>
                  <option value="sophomore">Sophomore</option>
                  <option value="junior">Junior</option>
                  <option value="senior">Senior</option>
                  <option value="graduate">Graduate Student</option>
                </select>
              </label>
              <label>
                <span className="eyebrow !text-[10px]">Experience level *</span>
                <select
                  name="experience_level"
                  value={form.experience_level}
                  onChange={change}
                  className="field"
                  data-testid="select-experience"
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                  <option value="professional">Professional</option>
                </select>
              </label>
              <label>
                <span className="eyebrow !text-[10px]">Discord username *</span>
                <input
                  name="discord_username"
                  value={form.discord_username}
                  onChange={change}
                  placeholder="yourname"
                  className="field"
                  data-testid="input-discord"
                />
              </label>
              <label>
                <span className="eyebrow !text-[10px]">Team *</span>
                <select
                  name="team_status"
                  value={form.team_status}
                  onChange={change}
                  className="field"
                  data-testid="select-team-status"
                >
                  <option value="" disabled>
                    Choose one
                  </option>
                  <option value="has_team">I have a team</option>
                  <option value="looking">I'm looking for a team</option>
                  <option value="solo">I'll compete solo</option>
                </select>
              </label>
              {form.team_status === "has_team" && (
                <label className="sm:col-span-2">
                  <span className="eyebrow !text-[10px]">
                    Team name (optional)
                  </span>
                  <input
                    name="team_name"
                    value={form.team_name}
                    onChange={change}
                    placeholder="If you've picked one"
                    className="field"
                    data-testid="input-team-name"
                  />
                </label>
              )}
              <p
                className="sm:col-span-2 text-xs leading-5 text-[#7d848e]"
                data-testid="text-data-use-notice"
              >
                We use this information only to run BuilderWars: reviewing
                registrations, giving approved participants Discord access,
                check-in, and event planning. Organizers can see it; sponsors
                only receive totals, never your details. Questions or removal
                requests: awssbg@wayne.edu.
              </p>
              {error && (
                <p
                  className="sm:col-span-2 text-sm text-[#a78bfa]"
                  data-testid="status-registration-error"
                >
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="btn btn-primary sm:col-span-2"
                disabled={submit.isPending}
                data-testid="button-submit-registration"
              >
                {submit.isPending ? (
                  <>
                    <Loader2 size={17} className="animate-spin" />
                    Registering
                  </>
                ) : (
                  <>
                    Register <ArrowRight size={16} />
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
function Footer() {
  return (
    <footer className="border-t border-[#252a32] bg-[#0e1114] py-14">
      <div className="container-shell grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <img
            src={logoSecondary}
            alt={EVENT_CONFIG.name}
            className="h-6 w-auto"
          />
          <p className="mt-4 max-w-[220px] text-sm leading-6 text-[#7d848e]">
            A weekend for people who would rather make the future than wait for
            it.
          </p>
        </div>
        <div>
          <p className="eyebrow">Quick links</p>
          <div className="mt-4 flex flex-col gap-3 text-sm text-[#9ca3af]">
            {nav.map(([l, h]) => (
              <a href={h} key={h} className="hover:text-[#a78bfa]">
                {l}
              </a>
            ))}
          </div>
        </div>
        <div>
          <p className="eyebrow">Contact</p>
          <div className="mt-4 flex flex-col gap-3 text-sm text-[#9ca3af]">
            <a
              href={`mailto:${EVENT_CONFIG.contactEmail}`}
              className="hover:text-[#a78bfa]"
            >
              {EVENT_CONFIG.contactEmail}
            </a>
            <a href={EVENT_CONFIG.discordUrl} className="hover:text-[#a78bfa]">
              Our Main Website
            </a>
            <button
              onClick={() => {
                window.location.href = "/api/login?returnTo=%2Fadmin";
              }}
              className="w-fit text-left transition hover:text-[#a78bfa]"
              data-testid="button-footer-admin"
            >
              Admin Access
            </button>
          </div>
        </div>
        <div>
          <p className="eyebrow">Follow the signal</p>
          <div className="mt-4 flex gap-3">
            <a
              href={EVENT_CONFIG.socialLinks.meetup}
              className="btn btn-ghost !h-10 !min-h-0 !w-10 !p-0"
              aria-label="Meetup.com"
              title="Meetup.com"
            >
              <img
                src="https://cdn.simpleicons.org/meetup/a78bfa"
                alt="Meetup.com logo"
                className="h-4 w-4"
              />
            </a>
            <a
              href={EVENT_CONFIG.socialLinks.instagram}
              className="btn btn-ghost !h-10 !min-h-0 !w-10 !p-0"
              aria-label="Instagram"
            >
              <Instagram size={15} />
            </a>
            <a
              href={EVENT_CONFIG.socialLinks.linkedin}
              className="btn btn-ghost !h-10 !min-h-0 !w-10 !p-0"
              aria-label="LinkedIn"
            >
              <Linkedin size={15} />
            </a>
          </div>
        </div>
      </div>
      <div className="container-shell mt-12 border-t border-[#252a32] pt-6 text-xs text-[#68717b]">
        © 2026 {EVENT_CONFIG.name}. All rights reserved.
      </div>
    </footer>
  );
}
function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <About />
        <Schedule />
        <Prizes />
        <Sponsors />
        <Faq />
        <Registration />
      </main>
      <Footer />
    </>
  );
}
function getApiErrorStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error))
    return null;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : null;
}

function AdminGate() {
  const { isLoading, isAuthenticated } = useAuth();
  const access = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey(), enabled: isAuthenticated },
  });
  const accessStatus = getApiErrorStatus(access.error);
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      window.location.href = "/api/login?returnTo=%2Fadmin";
      return;
    }
    if (accessStatus === 401) {
      window.location.href = "/api/login?returnTo=%2Fadmin";
      return;
    }
    if (accessStatus === 403) {
      window.location.replace("/");
    }
  }, [isLoading, isAuthenticated, accessStatus]);
  if (isLoading || !isAuthenticated || access.isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111418] text-[#a78bfa]">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (access.isError)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111418] p-5">
        <div className="panel max-w-md p-10 text-center">
          <h1 className="display text-3xl text-[#f7f4ed]">
            Admin access unavailable
          </h1>
          <p className="mt-3 text-sm leading-6 text-[#9ca3af]">
            We could not verify this dashboard session.
          </p>
        </div>
      </div>
    );
  return <Admin />;
}

function ResendConfirmationButton({
  id,
  onSent,
}: {
  id: number;
  onSent: () => void;
}) {
  const resend = useResendConfirmation();
  const [failed, setFailed] = useState(false);
  return (
    <span className="block text-xs text-[#a78bfa]">
      {failed ? "email failed again" : "email not sent"} ·{" "}
      <button
        type="button"
        className="underline disabled:opacity-50"
        disabled={resend.isPending}
        onClick={() => {
          setFailed(false);
          resend.mutate(
            { id },
            { onSuccess: onSent, onError: () => setFailed(true) },
          );
        }}
        data-testid={`button-resend-${id}`}
      >
        {resend.isPending ? "sending…" : "resend"}
      </button>
    </span>
  );
}
function DeleteRegistrationButton({
  id,
  name,
  onDeleted,
}: {
  id: number;
  name: string;
  onDeleted: () => void;
}) {
  const [hint, setHint] = useState(false);
  const [error, setError] = useState("");
  const remove = useDeleteRegistration({
    mutation: {
      onSuccess: () => {
        setHint(false);
        setError("");
        onDeleted();
      },
      onError: () => setError("Delete failed. Please try again."),
    },
  });
  const handleClick = () => {
    if (!remove.isPending) {
      setHint(true);
      window.setTimeout(() => setHint(false), 2000);
    }
  };
  const handleDoubleClick = () => {
    if (!remove.isPending) {
      setHint(false);
      remove.mutate({ id });
    }
  };
  return (
    <div className="flex min-w-[150px] flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        disabled={remove.isPending}
        title={`Double-click to permanently delete ${name}`}
        aria-label={`Double-click to permanently delete ${name}`}
        className="inline-flex min-h-[34px] items-center gap-2 rounded-md border border-[#7d3b2c] px-3 py-1.5 text-xs font-semibold text-[#ff9f85] transition hover:border-[#ff7557] hover:bg-[#3a201c] disabled:cursor-wait disabled:opacity-60"
        data-testid={`button-delete-registration-${id}`}
      >
        {remove.isPending ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Trash2 size={14} />
        )}
        <span>{remove.isPending ? "Deleting…" : "Delete"}</span>
      </button>
      {hint && !remove.isPending && (
        <span className="text-[10px] uppercase tracking-wide text-[#a78bfa]">
          Double-click to confirm
        </span>
      )}
      {error && <span className="text-[10px] text-[#ff9f85]">{error}</span>}
    </div>
  );
}

const TEAM_LABELS: Record<string, string> = {
  has_team: "Has a team",
  looking: "Looking",
  solo: "Solo",
};
function Admin() {
  const { isLoading, isAuthenticated, logout } = useAuth();
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState("");
  const [team, setTeam] = useState("");
  const [offset, setOffset] = useState(0);
  const params = useMemo(
    () => ({
      search: search || undefined,
      experience_level: level || undefined,
      team_status: team || undefined,
      limit: 50,
      offset,
    }),
    [search, level, team, offset],
  );
  const stats = useGetAdminStats({
    query: { queryKey: getGetAdminStatsQueryKey() },
  });
  const rows = useListRegistrations(params, {
    query: {
      queryKey: getListRegistrationsQueryKey(params),
      enabled: isAuthenticated,
    },
  });
  const refreshAdminData = () => {
    void queryClient.invalidateQueries({
      queryKey: getListRegistrationsQueryKey(params),
    });
    void queryClient.invalidateQueries({
      queryKey: getGetAdminStatsQueryKey(),
    });
  };
  if (isLoading)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111418] text-[#a78bfa]">
        <Loader2 className="animate-spin" />
      </div>
    );
  if (!isAuthenticated)
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#111418] p-5">
        <div className="panel max-w-md p-10 text-center">
          <img
            src={logoSubmark}
            alt="BuilderWars"
            className="mx-auto h-14 w-14"
          />
          <h1 className="display mt-6 text-3xl text-[#f7f4ed]">Admin Access</h1>
          <p className="mt-3 text-sm leading-6 text-[#9ca3af]">
            Log in to see registrations and event signals.
          </p>
          <button
            onClick={() => {
              window.location.href = "/api/login?returnTo=%2Fadmin";
            }}
            className="btn btn-primary mt-7 w-full"
            data-testid="button-admin-login"
          >
            Log In
          </button>
        </div>
      </div>
    );
  return (
    <div className="min-h-screen bg-[#111418] text-[#f7f4ed]">
      <header className="border-b border-[#292e36] px-5 py-5">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <span className="flex items-center gap-3 font-bold tracking-[.12em] text-[#a78bfa]">
            <img src={logoSubmark} alt="BuilderWars" className="h-7 w-7" />
            ADMIN DASHBOARD
          </span>
          <button
            onClick={logout}
            className="btn btn-ghost !min-h-[38px]"
            data-testid="button-admin-logout"
          >
            Log Out
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-5 py-10">
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            ["Total registrations", stats.data?.total ?? "—"],
            [
              "Looking for a team",
              stats.data ? (stats.data.by_team_status?.looking ?? 0) : "—",
            ],
            [
              "Beginners",
              stats.data
                ? (stats.data.by_experience_level?.beginner ?? 0)
                : "—",
            ],
          ].map(([l, v], i) => (
            <div className="panel p-5" key={l as string}>
              <p className="eyebrow">{l as string}</p>
              <strong
                className="mt-3 block font-mono text-4xl text-[#a78bfa]"
                data-testid={`text-admin-stat-${i}`}
              >
                {v as string}
              </strong>
            </div>
          ))}
        </div>
        <div className="mt-8 flex flex-col justify-between gap-4 sm:flex-row">
          <div className="flex flex-1 gap-3">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              placeholder="Search registrations"
              className="field max-w-sm"
              data-testid="input-admin-search"
            />
            <select
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setOffset(0);
              }}
              className="field max-w-[170px]"
              data-testid="select-admin-level"
            >
              <option value="">All levels</option>
              <option value="beginner">Beginner</option>
              <option value="intermediate">Intermediate</option>
              <option value="advanced">Advanced</option>
              <option value="professional">Professional</option>
            </select>
            <select
              value={team}
              onChange={(e) => {
                setTeam(e.target.value);
                setOffset(0);
              }}
              className="field max-w-[170px]"
              data-testid="select-admin-team"
            >
              <option value="">All team statuses</option>
              <option value="has_team">Has a team</option>
              <option value="looking">Looking for a team</option>
              <option value="solo">Solo</option>
            </select>
          </div>
          <a
            href="/api/admin/export"
            className="btn btn-primary"
            data-testid="link-export-csv"
          >
            <Download size={16} />
            Download CSV
          </a>
        </div>
        <div className="panel mt-5 overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="border-b border-[#2a3039] text-xs uppercase tracking-wider text-[#7d848e]">
              <tr>
                {[
                  "Name",
                  "Email",
                  "School",
                  "Class",
                  "Experience",
                  "Discord",
                  "Team",
                  "Status",
                  "Registered",
                  "Actions",
                ].map((x) => (
                  <th className="p-4" key={x}>
                    {x}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.isLoading ? (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-[#9ca3af]">
                    <Loader2 className="mx-auto animate-spin text-[#a78bfa]" />
                  </td>
                </tr>
              ) : (
                rows.data?.registrations?.map((r) => (
                  <tr className="border-b border-[#242a31]" key={r.id}>
                    <td className="p-4 font-medium">{r.name}</td>
                    <td className="p-4 text-[#9ca3af]">{r.email}</td>
                    <td className="p-4 text-[#9ca3af]">{r.school}</td>
                    <td className="p-4 capitalize text-[#9ca3af]">
                      {r.class_standing}
                    </td>
                    <td className="p-4 capitalize text-[#a78bfa]">
                      {r.experience_level}
                    </td>
                    <td className="p-4 text-[#9ca3af]">
                      {r.discord_username || "—"}
                    </td>
                    <td className="p-4 text-[#9ca3af]">
                      {r.team_status
                        ? (TEAM_LABELS[r.team_status] ?? r.team_status)
                        : "—"}
                      {r.team_name ? ` · ${r.team_name}` : ""}
                    </td>
                    <td className="p-4">
                      <span className="capitalize">{r.status}</span>
                      {r.source === "waitlist" && (
                        <span className="block text-xs text-[#7d848e]">
                          {r.discord_username
                            ? "from waitlist"
                            : "waitlist · not completed"}
                        </span>
                      )}
                      {(r.source !== "waitlist" || r.discord_username) &&
                        !r.confirmation_email_sent_at && (
                          <ResendConfirmationButton
                            id={r.id}
                            onSent={refreshAdminData}
                          />
                        )}
                    </td>
                    <td className="p-4 text-[#9ca3af]">
                      {new Date(r.created_at).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <DeleteRegistrationButton
                        id={r.id}
                        name={r.name}
                        onDeleted={refreshAdminData}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {!rows.isLoading && !rows.data?.registrations?.length && (
            <p className="p-10 text-center text-[#9ca3af]">
              No registrations match these filters.
            </p>
          )}
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            className="btn btn-ghost !min-h-[38px] disabled:opacity-40"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 50))}
          >
            Previous
          </button>
          <button
            className="btn btn-ghost !min-h-[38px] disabled:opacity-40"
            disabled={!rows.data || rows.data.registrations.length < 50}
            onClick={() => setOffset(offset + 50)}
          >
            Next
          </button>
        </div>
      </main>
    </div>
  );
}
function Router() {
  return (
    <Switch>
      <Route path="/admin" component={AdminGate} />
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}
export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);
  return (
    <QueryClientProvider client={queryClient}>
      <Router />
    </QueryClientProvider>
  );
}
