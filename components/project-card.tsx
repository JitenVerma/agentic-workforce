import { ArrowRight, Clock3 } from "lucide-react";
import { Project } from "@/lib/types";

interface ProjectCardProps {
  project: Project;
  onOpen: (projectId: string) => void;
}

export function ProjectCard({ project, onOpen }: ProjectCardProps) {
  return (
    <article className="project-card">
      <div className="project-card__header">
        <div>
          <span className="status-pill">{project.status}</span>
          {project.tag ? <span className="tag-pill">{project.tag}</span> : null}
        </div>
        <span className="muted inline-detail">
          <Clock3 size={14} />
          {project.lastUpdated}
        </span>
      </div>
      <div className="project-card__body">
        <h3>{project.name}</h3>
        <p>{project.description}</p>
      </div>
      <div className="project-card__footer">
        <div className="project-card__mini-stats">
          <span>{project.recentCalls.length} calls</span>
          <span>{project.openQuestions.length} open questions</span>
        </div>
        <button className="ghost-button" onClick={() => onOpen(project.id)}>
          Open
          <ArrowRight size={16} />
        </button>
      </div>
    </article>
  );
}
