import {
  AgentProfile,
  CallSummary,
  DemoEvent,
  Project,
} from "@/lib/types";

export const HUMAN_PARTICIPANT = {
  id: "human-user",
  name: "You",
  role: "Project Lead",
  initials: "YO",
  accent: "var(--accent-cyan)",
};

export const AGENTS: AgentProfile[] = [
  {
    id: "software-engineer",
    name: "Ava",
    role: "Software Engineer",
    description: "Maps feature ideas to APIs, services, and implementation sequencing.",
    perspective: "Translates requirements into services, data contracts, and delivery complexity.",
    accent: "var(--accent-blue)",
    initials: "SE",
  },
  {
    id: "cyber-security",
    name: "Rin",
    role: "Cyber Security Engineer",
    description: "Surfaces privacy, permissions, and compliance concerns before scope hardens.",
    perspective: "Focuses on identity, data boundaries, auditability, and operational risk.",
    accent: "var(--accent-red)",
    initials: "CY",
  },
  {
    id: "platform-engineer",
    name: "Mika",
    role: "Platform Engineer",
    description: "Keeps the plan grounded in reliability, environments, and observability.",
    perspective: "Highlights deployment patterns, failure modes, and platform scalability needs.",
    accent: "var(--accent-green)",
    initials: "PE",
  },
  {
    id: "ui-ux-designer",
    name: "Noor",
    role: "UI/UX Designer",
    description: "Turns ambiguity into user flows, interaction design, and accessibility cues.",
    perspective: "Pushes for frictionless flows, strong affordances, and inclusive product behavior.",
    accent: "var(--accent-pink)",
    initials: "UX",
  },
  {
    id: "solutions-architect",
    name: "Iris",
    role: "Solutions Architect",
    description: "Frames system boundaries, integration patterns, and non-functional tradeoffs.",
    perspective: "Connects the business concept to a workable platform shape and integration model.",
    accent: "var(--accent-amber)",
    initials: "SA",
  },
  {
    id: "product-owner",
    name: "Leo",
    role: "Product Owner",
    description: "Keeps the group aligned on outcomes, scope, and value delivery.",
    perspective: "Pressure-tests why each requirement matters and what should ship first.",
    accent: "var(--accent-violet)",
    initials: "PO",
  },
  {
    id: "scrum-master",
    name: "June",
    role: "Scrum Master",
    description: "Calls out sequencing risk, handoffs, and blockers that affect delivery rhythm.",
    perspective: "Focuses on collaboration health, decision ownership, and incremental execution.",
    accent: "var(--accent-teal)",
    initials: "SM",
  },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: "proj-orbit",
    name: "Orbit Launchpad",
    description: "Voice-driven kickoff room for shaping project requirements with AI specialists.",
    lastUpdated: "Today, 7:12 PM",
    status: "Active",
    tag: "Internal AI",
    notes: [
      "Investors want a strong product vision demo rather than infrastructure depth.",
      "The call experience should make specialist contributions feel coordinated and intentional.",
      "Human override must feel immediate and trustworthy.",
    ],
    requirementsDraft: [
      "Human host can invite a curated panel of specialist AI agents before the call starts.",
      "Queued hand raises need visible order, ownership, and turn-taking feedback.",
      "Post-call synthesis should turn discussion into requirements, risks, and next steps.",
    ],
    openQuestions: [
      "How much structure should be imposed on live discussions versus freeform conversation?",
      "What transcript moments should trigger suggested follow-up actions?",
      "How should persistent project memory appear across calls?",
    ],
    recentCalls: [
      {
        id: "call-1",
        title: "Investor demo rehearsal",
        startedAt: "Today, 5:40 PM",
        duration: "12m",
        outcome: "Sharpened value prop and queue explanation",
      },
      {
        id: "call-2",
        title: "Interaction concept pass",
        startedAt: "Yesterday",
        duration: "18m",
        outcome: "Defined participant states and summary layout",
      },
    ],
  },
  {
    id: "proj-lighthouse",
    name: "Lighthouse Ops Console",
    description: "Planning workspace for incident collaboration with embedded specialists.",
    lastUpdated: "Yesterday",
    status: "Review",
    tag: "Ops Platform",
    notes: [
      "Stakeholders care about fast operator onboarding and confident escalation paths.",
      "Need a clean story for reliability and auditability from day one.",
    ],
    requirementsDraft: [
      "Workspace should unify live coordination, incident context, and follow-up actions.",
      "Specialist perspectives should feel consultative, not autonomous.",
    ],
    openQuestions: [
      "Should incident-specific agent presets exist?",
      "How should compliance evidence be captured in summaries?",
    ],
    recentCalls: [
      {
        id: "call-3",
        title: "Ops review sync",
        startedAt: "Yesterday",
        duration: "24m",
        outcome: "Aligned on reliability metrics and access controls",
      },
    ],
  },
  {
    id: "proj-sprout",
    name: "Sprout Partner Portal",
    description: "Collaborative planning environment for a new partner onboarding experience.",
    lastUpdated: "2 days ago",
    status: "Draft",
    tag: "B2B SaaS",
    notes: [
      "The first release should reduce manual setup work for partner success teams.",
      "Call summaries need to feel ready for handoff into backlog refinement.",
    ],
    requirementsDraft: [
      "Support a structured kickoff call that balances user, business, and delivery concerns.",
    ],
    openQuestions: [
      "Which requirements deserve explicit prioritization in-call?",
    ],
    recentCalls: [],
  },
];

const agentSpeechLibrary: Record<
  string,
  { raise: string; transcript: (project: Project) => string; duration: number }
> = {
  "software-engineer": {
    raise: "Ava wants to map the concept to implementation slices.",
    transcript: (project) =>
      `For ${project.name}, I would split the build into a project workspace shell, a simulated call engine, and a structured summary layer so the demo feels real without depending on actual orchestration.`,
    duration: 7,
  },
  "cyber-security": {
    raise: "Rin has a privacy and permissions concern to add.",
    transcript: (project) =>
      `Before we treat transcripts as project memory in ${project.name}, we should define role-based access, redaction expectations, and how sensitive notes are separated from broader team summaries.`,
    duration: 8,
  },
  "platform-engineer": {
    raise: "Mika wants to weigh in on reliability and environments.",
    transcript: () =>
      "I would frame the product as desktop-first for the prototype, but still show signals for connection health, resilience, and observability so teams trust the room during longer planning sessions.",
    duration: 7,
  },
  "ui-ux-designer": {
    raise: "Noor sees a flow clarity opportunity.",
    transcript: () =>
      "The queue should be legible without reading a manual, so yellow states, numbered badges, and a clear human priority callout are doing real product work here, not just decoration.",
    duration: 8,
  },
  "solutions-architect": {
    raise: "Iris wants to outline the system boundary.",
    transcript: () =>
      "The strongest story is to position this as a collaboration layer over future model orchestration, where the workspace owns participant state, turn-taking, and decision capture regardless of the underlying agent runtime.",
    duration: 8,
  },
  "product-owner": {
    raise: "Leo wants to tighten scope around the core user value.",
    transcript: () =>
      "For the first milestone, success is not autonomous planning. It is helping a project lead leave the call with aligned requirements, visible tradeoffs, and a crisp next-step package for the team.",
    duration: 7,
  },
  "scrum-master": {
    raise: "June wants to flag delivery rhythm and blockers.",
    transcript: () =>
      "I would make the summary explicitly handoff-ready: decisions made, unresolved questions, owners, and what needs another session. That turns a flashy demo into something teams can imagine using every sprint.",
    duration: 7,
  },
};

export function buildDemoEvents(
  selectedAgentIds: string[],
  project: Project,
): DemoEvent[] {
  return selectedAgentIds.map((agentId, index) => {
    const speech = agentSpeechLibrary[agentId];

    return {
      id: `event-${agentId}`,
      at: 4 + index * 4,
      agentId,
      duration: speech.duration,
      raiseMessage: speech.raise,
      transcript: speech.transcript(project),
    };
  });
}

export const HUMAN_PROMPTS = [
  "Let's keep this grounded in what a project lead needs in the first ten minutes of a kickoff.",
  "I want the human override to feel obvious, not like the user is fighting an invisible system.",
  "Please pressure-test whether the queue and summary views are enough to tell the product story.",
];

export function buildCallSummary(selectedAgentIds: string[], project: Project): CallSummary {
  const has = (agentId: string) => selectedAgentIds.includes(agentId);

  return {
    requirements: [
      "Create projects and launch structured kickoff calls from the workspace.",
      "Invite specialist AI participants before the session starts and make their perspectives visible.",
      "Show live participant state, a hand-raise queue, and human-first speaking controls throughout the call.",
      "Capture the outcome as a reusable summary with decisions, risks, and follow-up actions.",
    ],
    risks: [
      has("cyber-security")
        ? "Clarify transcript access controls, retention, and sensitive-note handling."
        : "Privacy posture still needs explicit transcript and note-sharing rules.",
      has("platform-engineer")
        ? "Connection trust depends on visible reliability cues and state recovery."
        : "The experience should explain call state clearly enough to feel dependable.",
      "If too many agents speak without structure, the room can feel theatrical instead of useful.",
    ],
    architecture: [
      has("solutions-architect")
        ? "Separate the collaboration shell from any future orchestration runtime so UX can evolve independently."
        : "Keep the call UI decoupled from future backend orchestration choices.",
      has("software-engineer")
        ? "Model participants, queue events, and transcript turns as simple local state first, then swap in real-time services later."
        : "Use local state for prototype turn-taking and transcript simulation.",
      "Store summaries as durable project artifacts linked to each call record.",
    ],
    ux: [
      has("ui-ux-designer")
        ? "Use strong color and motion language so speaking, listening, and queued states are obvious at a glance."
        : "Participant states should remain readable even in a dense multi-agent room.",
      "Human priority should be explicit in controls and transcript activity updates.",
      "Agent selection should feel exciting but still communicate why each role matters.",
    ],
    nextSteps: [
      `Turn the outcomes from ${project.name} into a backlog-ready requirements brief.`,
      "Prototype a second call template for discovery versus delivery planning.",
      "Decide which transcript moments should auto-promote into requirements or open questions.",
    ],
  };
}
