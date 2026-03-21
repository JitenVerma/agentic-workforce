import "server-only";

import { AgentCard, Artifact, Message, Part, Task } from "@a2a-js/sdk";
import { ClientFactory } from "@a2a-js/sdk/client";
import {
  A2AAgentCardSummary,
  A2AAgentMessageRequest,
  A2AAgentMessageResponse,
  A2AAgentRegistration,
  A2AResolvedAgent,
  A2ATextArtifact,
} from "@/lib/a2a/types";
import { getA2AAgentRegistry } from "@/lib/a2a/registry";

const clientFactory = new ClientFactory();

function normalizeCardPath(cardPath: string | undefined) {
  if (!cardPath) {
    return ".well-known/agent-card.json";
  }

  return cardPath.replace(/^\/+/, "");
}

function buildAgentCardUrl(registration: A2AAgentRegistration) {
  const cardPath = normalizeCardPath(registration.cardPath);
  const baseUrl = registration.baseUrl.endsWith("/")
    ? registration.baseUrl
    : `${registration.baseUrl}/`;

  return new URL(cardPath, baseUrl).toString();
}

function normalizeAgentCardUrl(
  card: AgentCard,
  registration: A2AAgentRegistration,
): AgentCard {
  try {
    const advertisedUrl = new URL(card.url);
    const registeredUrl = new URL(registration.baseUrl);

    if (
      advertisedUrl.origin === registeredUrl.origin &&
      (advertisedUrl.pathname === "/" || advertisedUrl.pathname === "")
    ) {
      return {
        ...card,
        url: registration.baseUrl,
      };
    }
  } catch {
    return {
      ...card,
      url: registration.baseUrl,
    };
  }

  return card;
}

function buildRequestOptions(registration: A2AAgentRegistration) {
  if (!registration.serviceParameters) {
    return undefined;
  }

  return {
    serviceParameters: registration.serviceParameters,
  };
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "Unknown A2A error";
}

function partsToText(parts: Part[] | undefined) {
  if (!parts || parts.length === 0) {
    return "";
  }

  return parts
    .map((part) => {
      if (part.kind === "text") {
        return part.text;
      }

      if (part.kind === "data") {
        return JSON.stringify(part.data, null, 2);
      }

      if ("uri" in part.file) {
        return `File: ${part.file.name ?? part.file.uri}`;
      }

      return `File: ${part.file.name ?? "binary attachment"}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

function normalizeArtifacts(artifacts: Artifact[] | undefined): A2ATextArtifact[] {
  if (!artifacts || artifacts.length === 0) {
    return [];
  }

  return artifacts.map((artifact) => ({
    artifactId: artifact.artifactId,
    name: artifact.name,
    description: artifact.description,
    text: partsToText(artifact.parts),
  }));
}

function normalizeAgentCard(card: AgentCard): A2AAgentCardSummary {
  return {
    name: card.name,
    description: card.description ?? "No description provided.",
    url: card.url,
    version: card.version,
    defaultInputModes: card.defaultInputModes ?? [],
    defaultOutputModes: card.defaultOutputModes ?? [],
    supportsStreaming: Boolean(card.capabilities?.streaming),
    supportsPushNotifications: Boolean(card.capabilities?.pushNotifications),
    skills: (card.skills ?? []).map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      tags: skill.tags ?? [],
    })),
  };
}

async function getClientForRegistration(registration: A2AAgentRegistration) {
  const agentCardUrl = buildAgentCardUrl(registration);
  const response = await fetch(agentCardUrl, {
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch Agent Card from ${agentCardUrl}: ${response.status}`,
    );
  }

  const rawCard = (await response.json()) as AgentCard;
  return clientFactory.createFromAgentCard(
    normalizeAgentCardUrl(rawCard, registration),
  );
}

function findRegistration(agentId: string) {
  const registration = getA2AAgentRegistry().find((agent) => agent.id === agentId);

  if (!registration) {
    throw new Error(`No A2A agent registered with id "${agentId}".`);
  }

  return registration;
}

function normalizeMessageResult(
  agentId: string,
  agentName: string,
  result: Message | Task,
): A2AAgentMessageResponse {
  if (result.kind === "message") {
    return {
      agentId,
      agentName,
      kind: "message",
      text: partsToText(result.parts) || "The agent returned an empty message.",
      contextId: result.contextId,
      taskId: result.taskId,
      artifacts: [],
    };
  }

  const artifacts = normalizeArtifacts(result.artifacts);
  const text =
    partsToText(result.status.message?.parts) ||
    artifacts.map((artifact) => artifact.text).filter(Boolean).join("\n\n") ||
    partsToText(
      [...(result.history ?? [])]
        .reverse()
        .find((message) => message.role === "agent")?.parts,
    ) ||
    `Task ${result.id} is ${result.status.state}.`;

  return {
    agentId,
    agentName,
    kind: "task",
    text,
    contextId: result.contextId,
    taskId: result.id,
    state: result.status.state,
    artifacts,
  };
}

export async function listA2AAgents(): Promise<A2AResolvedAgent[]> {
  const registry = getA2AAgentRegistry();

  return Promise.all(
    registry.map(async (registration) => {
      try {
        const client = await getClientForRegistration(registration);
        const card = await client.getAgentCard(buildRequestOptions(registration));

        return {
          id: registration.id,
          name: registration.name,
          description: registration.description,
          baseUrl: registration.baseUrl,
          cardPath: registration.cardPath,
          liveUrl: registration.liveUrl,
          status: "online" as const,
          card: normalizeAgentCard(card),
        };
      } catch (error) {
        return {
          id: registration.id,
          name: registration.name,
          description: registration.description,
          baseUrl: registration.baseUrl,
          cardPath: registration.cardPath,
          liveUrl: registration.liveUrl,
          status: "offline" as const,
          error: getErrorMessage(error),
        };
      }
    }),
  );
}

export async function sendTextToA2AAgent(
  agentId: string,
  request: A2AAgentMessageRequest,
): Promise<A2AAgentMessageResponse> {
  const registration = findRegistration(agentId);
  const client = await getClientForRegistration(registration);

  const result = await client.sendMessage(
    {
      message: {
        kind: "message",
        messageId: crypto.randomUUID(),
        role: "user",
        contextId: request.contextId,
        taskId: request.taskId,
        parts: [{ kind: "text", text: request.text }],
      },
    },
    buildRequestOptions(registration),
  );

  return normalizeMessageResult(agentId, registration.name, result);
}
