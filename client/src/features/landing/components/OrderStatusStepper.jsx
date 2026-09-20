import Icon from "@/components/ui/icon";

/**
 * OrderStatusStepper — single source of truth for guest-facing order
 * progress (BR-04). Real statuses, not friendly simplifications, so the
 * success screen and the tracking page can never disagree.
 */

const STEPS = [
  { key: "pending", title: "Pending", desc: "Awaiting confirmation" },
  { key: "accepted", title: "Accepted", desc: "Order confirmed" },
  { key: "preparing", title: "Preparing", desc: "In the kitchen" },
  { key: "completed", title: "Completed", desc: "Served" },
];

function Step({ state, index, title, desc }) {
  const cls = state === "completed" ? "step-completed" : state === "current" ? "step-current" : "step-upcoming";
  return (
    <div className={`ord-step-item ${cls}`}>
      <div className="ord-step-circle">
        {state === "completed" ? <Icon name="check" size={14} /> : index}
      </div>
      <div className="ord-step-text">
        <span className="ord-step-title">{title}</span>
        <span className="ord-step-desc">{desc}</span>
      </div>
    </div>
  );
}

export default function OrderStatusStepper({ status }) {
  if (status === "cancelled") return null;
  const at = STEPS.findIndex((s) => s.key === status);
  return (
    <div className="ord-status-stepper">
      {STEPS.map((step, i) => {
        const state = status === "completed" || i < at ? "completed" : i === at ? "current" : "upcoming";
        return (
          <span key={step.key} style={{ display: "contents" }}>
            <Step state={state} index={i + 1} title={step.title} desc={step.desc} />
            {i < STEPS.length - 1 && <div className="ord-step-line" />}
          </span>
        );
      })}
    </div>
  );
}
