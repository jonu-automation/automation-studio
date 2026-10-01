import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock, Globe, Sparkles, MessageSquare, CheckCircle2, Loader2, Play } from "lucide-react";

type NodeState = "idle" | "running" | "done";

interface WorkflowNode {
  id: number;
  icon: React.ElementType;
  label: string;
  sublabel: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  ringClass: string;
  runDuration: number;
}

const NODES: WorkflowNode[] = [
  {
    id: 0,
    icon: Clock,
    label: "Schedule Trigger",
    sublabel: "Every day 9:00 AM",
    colorClass: "text-violet-400",
    bgClass: "bg-violet-400/15",
    borderClass: "border-violet-400/30",
    ringClass: "ring-violet-400/40",
    runDuration: 600,
  },
  {
    id: 1,
    icon: Globe,
    label: "Fetch Headlines",
    sublabel: "HTTP request example",
    colorClass: "text-blue-400",
    bgClass: "bg-blue-400/15",
    borderClass: "border-blue-400/30",
    ringClass: "ring-blue-400/40",
    runDuration: 1100,
  },
  {
    id: 2,
    icon: Sparkles,
    label: "AI Summarize",
    sublabel: "AI step example",
    colorClass: "text-purple-400",
    bgClass: "bg-purple-400/15",
    borderClass: "border-purple-400/30",
    ringClass: "ring-purple-400/40",
    runDuration: 1800,
  },
  {
    id: 3,
    icon: MessageSquare,
    label: "Post to Slack",
    sublabel: "#daily-digest · Example output",
    colorClass: "text-emerald-400",
    bgClass: "bg-emerald-400/15",
    borderClass: "border-emerald-400/30",
    ringClass: "ring-emerald-400/40",
    runDuration: 700,
  },
];

const EDGE_ANIMATE_MS = 350;
const PAUSE_AFTER_MS = 1400;

export default function WorkflowPreview() {
  const [nodeStates, setNodeStates] = useState<NodeState[]>(["idle", "idle", "idle", "idle"]);
  const [edgeActive, setEdgeActive] = useState<boolean[]>([false, false, false]);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clearAll = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };

  const addTimer = (fn: () => void, delay: number) => {
    const id = setTimeout(fn, delay);
    timersRef.current.push(id);
  };

  const runSequence = () => {
    timersRef.current = [];
    setNodeStates(["idle", "idle", "idle", "idle"]);
    setEdgeActive([false, false, false]);

    let t = 0;

    NODES.forEach((node, i) => {
      const startAt = t;
      addTimer(() => {
        setNodeStates((prev) => {
          const next = [...prev] as NodeState[];
          next[i] = "running";
          return next;
        });
      }, startAt);

      t += node.runDuration;
      const doneAt = t;

      addTimer(() => {
        setNodeStates((prev) => {
          const next = [...prev] as NodeState[];
          next[i] = "done";
          return next;
        });
        if (i < NODES.length - 1) {
          setEdgeActive((prev) => {
            const next = [...prev];
            next[i] = true;
            return next;
          });
        }
      }, doneAt);

      t += EDGE_ANIMATE_MS + 80;
    });

    t += PAUSE_AFTER_MS;
    addTimer(runSequence, t);
  };

  useEffect(() => {
    const startId = setTimeout(runSequence, 700);
    timersRef.current.push(startId);
    return clearAll;
  }, []);

  return (
    <div className="relative w-full max-w-3xl mx-auto mt-12 mb-2 select-none">
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-2xl shadow-black/30">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/20">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400/60" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400/60" />
          <div className="flex items-center gap-1.5 ml-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-muted-foreground font-mono">Illustrative preview · Daily AI News Digest → Slack</span>
          </div>
        </div>

        <div className="px-6 py-8">
          <div className="flex items-center justify-between gap-2">
            {NODES.map((node, i) => (
              <div key={node.id} className="flex items-center flex-1 min-w-0">
                <NodeCard node={node} state={nodeStates[i]} />
                {i < NODES.length - 1 && (
                  <EdgeArrow active={edgeActive[i]} colorClass={node.colorClass} />
                )}
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2">
            <div className="flex-1 h-px bg-border" />
            <RunStatus states={nodeStates} />
            <div className="flex-1 h-px bg-border" />
          </div>
        </div>
      </div>

      <p className="text-center text-xs text-muted-foreground mt-3">
        Animated illustration · No external requests are sent
      </p>
    </div>
  );
}

function NodeCard({ node, state }: { node: WorkflowNode; state: NodeState }) {
  const Icon = node.icon;
  const isRunning = state === "running";
  const isDone = state === "done";
  const isActive = isRunning || isDone;

  return (
    <motion.div
      className={`relative flex flex-col items-center gap-2 rounded-xl border p-3 w-full transition-colors duration-300 ${
        !isActive
          ? "border-border bg-background"
          : isDone
          ? `${node.borderClass} bg-background`
          : `${node.borderClass} ${node.bgClass}`
      } ${isRunning ? `ring-2 ${node.ringClass}` : ""}`}
      animate={isRunning ? { scale: [1, 1.03, 1] } : { scale: 1 }}
      transition={isRunning ? { duration: 0.7, repeat: Infinity } : { duration: 0.2 }}
    >
      <div
        className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors duration-300 ${
          !isActive ? "bg-muted" : node.bgClass
        }`}
      >
        <Icon
          className={`w-4 h-4 transition-colors duration-300 ${
            !isActive ? "text-muted-foreground" : node.colorClass
          }`}
        />
      </div>

      <div className="text-center">
        <p
          className={`text-[11px] font-semibold leading-tight transition-colors duration-300 ${
            !isActive ? "text-muted-foreground" : "text-foreground"
          }`}
        >
          {node.label}
        </p>
        <p
          className={`text-[10px] mt-0.5 leading-tight transition-colors duration-300 ${
            isDone ? node.colorClass : "text-muted-foreground/50"
          }`}
        >
          {node.sublabel}
        </p>
      </div>

      <AnimatePresence mode="wait">
        {isRunning && (
          <motion.div
            key="spinner"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.5 }}
            className="absolute -top-2 -right-2"
          >
            <div className={`w-5 h-5 rounded-full bg-card border ${node.borderClass} flex items-center justify-center`}>
              <Loader2 className={`w-3 h-3 ${node.colorClass} animate-spin`} />
            </div>
          </motion.div>
        )}
        {isDone && (
          <motion.div
            key="check"
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute -top-2 -right-2"
          >
            <div className="w-5 h-5 rounded-full bg-emerald-400/20 border border-emerald-400/40 flex items-center justify-center">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const COLOR_TO_BG: Record<string, string> = {
  "text-violet-400": "bg-violet-400",
  "text-blue-400": "bg-blue-400",
  "text-purple-400": "bg-purple-400",
  "text-emerald-400": "bg-emerald-400",
  "text-amber-400": "bg-amber-400",
  "text-cyan-400": "bg-cyan-400",
};

const COLOR_TO_BORDER_L: Record<string, string> = {
  "text-violet-400": "border-l-violet-400",
  "text-blue-400": "border-l-blue-400",
  "text-purple-400": "border-l-purple-400",
  "text-emerald-400": "border-l-emerald-400",
  "text-amber-400": "border-l-amber-400",
  "text-cyan-400": "border-l-cyan-400",
};

function EdgeArrow({ active, colorClass }: { active: boolean; colorClass: string }) {
  const bgClass = COLOR_TO_BG[colorClass] ?? "bg-border";
  const borderLClass = COLOR_TO_BORDER_L[colorClass] ?? "border-l-border";

  return (
    <div className="flex items-center justify-center px-1 flex-shrink-0 w-8">
      <div className="relative w-full flex items-center">
        <motion.div
          className={`h-px w-full transition-colors duration-300 ${active ? bgClass : "bg-border"}`}
          initial={false}
          animate={{ opacity: active ? 1 : 0.35 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
        />
        <div
          className={`absolute right-0 w-0 h-0 border-t-[3px] border-b-[3px] border-l-[5px] border-t-transparent border-b-transparent transition-colors duration-300 ${
            active ? borderLClass : "border-l-muted-foreground/30"
          }`}
        />
      </div>
    </div>
  );
}

function RunStatus({ states }: { states: NodeState[] }) {
  const doneCount = states.filter((s) => s === "done").length;
  const isRunning = states.some((s) => s === "running");
  const allDone = doneCount === NODES.length;

  return (
    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/40 border border-border">
      {allDone ? (
        <>
          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] text-emerald-400 font-medium">Run complete · 6.2 compute-sec billed</span>
        </>
      ) : isRunning ? (
        <>
          <Loader2 className="w-3 h-3 text-primary animate-spin" />
          <span className="text-[10px] text-muted-foreground font-medium">
            Running node {doneCount + 1} of {NODES.length}…
          </span>
        </>
      ) : (
        <>
          <Play className="w-3 h-3 text-muted-foreground" />
          <span className="text-[10px] text-muted-foreground font-medium">Waiting for next trigger…</span>
        </>
      )}
    </div>
  );
}
