import "server-only";

import { A2AAgentRegistration } from "@/lib/a2a/types";

const DEFAULT_LOCAL_AGENT_HOST = "http://127.0.0.1:8000";

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.trim().replace(/\/+$/, "");
}

function normalizeCardPath(cardPath: string) {
  const trimmed = cardPath.trim();

  if (!trimmed) {
    return ".well-known/agent-card.json";
  }

  return trimmed.replace(/^\/+/, "");
}

function normalizeAgentBaseUrl(rawUrl: string, agentPath: string) {
  const normalized = normalizeBaseUrl(rawUrl);

  try {
    const url = new URL(normalized);
    const normalizedPath = url.pathname.replace(/\/+$/, "");

    if (!normalizedPath || normalizedPath === "") {
      url.pathname = agentPath;
      return normalizeBaseUrl(url.toString());
    }

    if (normalizedPath === agentPath) {
      return normalizeBaseUrl(url.toString());
    }

    return normalizeBaseUrl(url.toString());
  } catch {
    return normalized;
  }
}

function getAgentPathForId(agentId: string) {
  if (agentId === "conductor-agent") {
    return "/conductor";
  }

  if (agentId === "software-engineer-agent") {
    return "/software-engineer";
  }

  if (agentId === "solutions-architect-agent") {
    return "/solutions-architect";
  }

  return "";
}

function normalizeLiveUrl(rawUrl: string, agentPath: string) {
  const normalized = normalizeBaseUrl(rawUrl);

  try {
    const url = new URL(normalized);
    const normalizedPath = url.pathname.replace(/\/+$/, "");

    if (!normalizedPath || normalizedPath === "") {
      url.pathname = `${agentPath}/run_live`;
      return normalizeBaseUrl(url.toString());
    }

    return normalizeBaseUrl(url.toString());
  } catch {
    return normalized;
  }
}

function sanitizeServiceParameters(
  value: unknown,
): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, rawValue]) =>
      typeof rawValue === "string" ? [[key, rawValue]] : [],
    ),
  );
}

function sanitizeRegistration(
  value: unknown,
): A2AAgentRegistration | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const candidate = value as Record<string, unknown>;

  if (
    typeof candidate.id !== "string" ||
    typeof candidate.name !== "string" ||
    typeof candidate.baseUrl !== "string"
  ) {
    return null;
  }

  const agentPath = getAgentPathForId(candidate.id);

  return {
    id: candidate.id,
    name: candidate.name,
    baseUrl: agentPath
      ? normalizeAgentBaseUrl(candidate.baseUrl, agentPath)
      : normalizeBaseUrl(candidate.baseUrl),
    cardPath:
      typeof candidate.cardPath === "string" && candidate.cardPath.length > 0
        ? normalizeCardPath(candidate.cardPath)
        : ".well-known/agent-card.json",
    liveUrl:
      typeof candidate.liveUrl === "string" && candidate.liveUrl.length > 0
        ? agentPath
          ? normalizeLiveUrl(candidate.liveUrl, agentPath)
          : candidate.liveUrl
        : undefined,
    description:
      typeof candidate.description === "string" && candidate.description.length > 0
        ? candidate.description
        : undefined,
    serviceParameters: sanitizeServiceParameters(candidate.serviceParameters),
  };
}

function getDefaultRegistry(): A2AAgentRegistration[] {
  const specialistBaseUrl = normalizeBaseUrl(
    process.env.A2A_SPECIALIST_BASE_URL ?? DEFAULT_LOCAL_AGENT_HOST,
  );

  return [
    {
      id: "conductor-agent",
      name: "Conductor Agent",
      description: "Local ADK conductor agent for moderated room orchestration.",
      baseUrl: normalizeAgentBaseUrl(
        process.env.A2A_CONDUCTOR_URL ?? `${specialistBaseUrl}/conductor`,
        "/conductor",
      ),
      cardPath: ".well-known/agent-card.json",
      liveUrl: process.env.A2A_CONDUCTOR_LIVE_URL ?? `${DEFAULT_LOCAL_AGENT_HOST}/conductor/run_live`,
    },
    {
      id: "software-engineer-agent",
      name: "Software Engineer Agent",
      description: "Local ADK software engineer agent for implementation guidance.",
      baseUrl: normalizeAgentBaseUrl(
        process.env.A2A_SOFTWARE_ENGINEER_URL ??
          `${specialistBaseUrl}/software-engineer`,
        "/software-engineer",
      ),
      cardPath: ".well-known/agent-card.json",
      liveUrl:
        process.env.A2A_SOFTWARE_ENGINEER_LIVE_URL ??
        `${DEFAULT_LOCAL_AGENT_HOST}/software-engineer/run_live`,
    },
    {
      id: "solutions-architect-agent",
      name: "Solutions Architect Agent",
      description: "Local ADK solutions architect agent for room architecture guidance.",
      baseUrl: normalizeAgentBaseUrl(
        process.env.A2A_SOLUTIONS_ARCHITECT_URL ??
          `${specialistBaseUrl}/solutions-architect`,
        "/solutions-architect",
      ),
      cardPath: ".well-known/agent-card.json",
      liveUrl:
        process.env.A2A_SOLUTIONS_ARCHITECT_LIVE_URL ??
        `${DEFAULT_LOCAL_AGENT_HOST}/solutions-architect/run_live`,
    },
  ];
}

function parseRegistryFromEnv(): A2AAgentRegistration[] {
  const rawRegistry = process.env.A2A_AGENT_REGISTRY;

  if (!rawRegistry) {
    return [];
  }

  try {
    const parsed = JSON.parse(rawRegistry);
    if (!Array.isArray(parsed)) {
      console.warn("A2A_AGENT_REGISTRY must be a JSON array.");
      return [];
    }

    return parsed
      .map(sanitizeRegistration)
      .filter((registration): registration is A2AAgentRegistration =>
        Boolean(registration),
      );
  } catch (error) {
    console.warn("Failed to parse A2A_AGENT_REGISTRY.", error);
    return [];
  }
}

export function getA2AAgentRegistry(): A2AAgentRegistration[] {
  const merged = new Map<string, A2AAgentRegistration>();

  for (const registration of getDefaultRegistry()) {
    merged.set(registration.id, registration);
  }

  for (const registration of parseRegistryFromEnv()) {
    merged.set(registration.id, registration);
  }

  return Array.from(merged.values());
}
