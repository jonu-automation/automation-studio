import type { WorkflowNode, WorkflowEdge } from "./executor";

export function buildExecutionOrder(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  const byId = new Map(nodes.map(node => [node.id, node]));
  if (byId.size !== nodes.length) throw new Error("Workflow contains duplicate node IDs.");
  const indegree = new Map(nodes.map(node => [node.id, 0]));
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) throw new Error("Workflow connection references a missing node.");
    indegree.set(edge.target, indegree.get(edge.target)! + 1);
  }
  const queue = nodes.filter(node => indegree.get(node.id) === 0);
  const result: WorkflowNode[] = [];
  while (queue.length) {
    const node = queue.shift()!;
    result.push(node);
    for (const edge of edges.filter(edge => edge.source === node.id)) {
      const count = indegree.get(edge.target)! - 1;
      indegree.set(edge.target, count);
      if (count === 0) queue.push(byId.get(edge.target)!);
    }
  }
  if (result.length !== nodes.length) throw new Error("Workflow contains a cycle. Cyclic workflows are not supported.");
  return result;
}

export function inputForNode(node: WorkflowNode, nodes: WorkflowNode[], edges: WorkflowEdge[], outputs: Map<string, Record<string, unknown>>, rootInput: Record<string, unknown>) {
  const incoming = edges.filter(edge => edge.target === node.id);
  if (!incoming.length) return rootInput;
  const active = incoming.filter(edge => {
    const output = outputs.get(edge.source);
    if (!output) return false;
    const source = nodes.find(candidate => candidate.id === edge.source);
    if (source?.type === "if_else") return output.branch === (edge.sourceHandle ?? "true");
    return output.passed !== false;
  });
  if (!active.length) return null;
  if (node.type === "merge") return Object.fromEntries(active.map(edge => [edge.source, outputs.get(edge.source)!]));
  return Object.assign({}, ...active.map(edge => outputs.get(edge.source)!));
}
