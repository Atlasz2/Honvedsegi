import { ChevronDown, ChevronRight } from "lucide-react";
import type { OperationTreeNode } from "@/lib/types";

type Props = {
  nodes: OperationTreeNode[];
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  matchingIds?: Set<string> | null;
};

const statusDot: Record<string, string> = {
  Tervezett: "bg-blue-500",
  Folyamatban: "bg-green-500",
  Befejezett: "bg-gray-400",
  Törölve: "bg-red-500",
};

function TreeItem({
  node,
  level,
  selectedId,
  expanded,
  onToggle,
  onSelect,
  matchingIds,
}: {
  node: OperationTreeNode;
  level: number;
  selectedId: string | null;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  matchingIds?: Set<string> | null;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const isMatch = matchingIds ? matchingIds.has(node.id) : true;
  const hasMatchingChild = matchingIds ? node.children.some((c) => matchingIds.has(c.id) || c.children.some((gc) => matchingIds.has(gc.id))) : true;

  // Hide nodes that don't match and have no matching children
  if (matchingIds && !isMatch && !hasMatchingChild) return null;

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 px-2 py-1.5 cursor-pointer border transition-colors ${
          isSelected
            ? "bg-primary/10 border-primary/30 text-foreground"
            : matchingIds && isMatch
              ? "bg-primary/5 border-primary/10 hover:bg-secondary"
              : "border-transparent hover:bg-secondary"
        }`}
        style={{ marginLeft: `${level * 14}px`, borderRadius: "2px" }}
        onClick={() => onSelect(node.id)}
      >
        {/* Expand toggle */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) onToggle(node.id);
          }}
          className="w-4 h-4 flex-shrink-0 inline-flex items-center justify-center text-muted-foreground"
          aria-label={hasChildren ? "Nyit/zár" : ""}
        >
          {hasChildren
            ? isExpanded
              ? <ChevronDown className="w-3.5 h-3.5" />
              : <ChevronRight className="w-3.5 h-3.5" />
            : <span className="w-3.5 h-3.5 inline-block" />}
        </button>

        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot[node.status] ?? "bg-gray-400"}`} />

        {/* Content */}
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-medium truncate ${isSelected ? "text-primary" : ""}`}>{node.name}</p>
          <p className="text-[10px] font-mono text-muted-foreground truncate">
            {node.startDate.slice(0, 10)} → {node.endDate.slice(0, 10)}
            {node.location ? ` · ${node.location}` : ""}
          </p>
        </div>

        {/* Child count badge */}
        {hasChildren && (
          <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">
            {node.children.length}
          </span>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              level={level + 1}
              selectedId={selectedId}
              expanded={expanded}
              onToggle={onToggle}
              onSelect={onSelect}
              matchingIds={matchingIds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function OperationTree({ nodes, selectedId, expanded, onToggle, onSelect, matchingIds }: Props) {
  if (nodes.length === 0) {
    return <div className="text-xs text-muted-foreground font-mono p-3">Nincs művelet a fában.</div>;
  }

  return (
    <div className="space-y-0.5">
      {nodes.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          level={0}
          selectedId={selectedId}
          expanded={expanded}
          onToggle={onToggle}
          onSelect={onSelect}
          matchingIds={matchingIds}
        />
      ))}
    </div>
  );
}
