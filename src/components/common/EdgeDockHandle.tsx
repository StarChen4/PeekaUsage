type EdgeDockHandleProps = {
  edge: "left" | "right" | "top";
};

export default function EdgeDockHandle({ edge }: EdgeDockHandleProps) {
  return (
    <div className={`edge-dock-handle edge-${edge}`} aria-hidden="true">
      <div className="edge-dock-handle-shell">
        <span className="edge-dock-handle-glow" />
        <span className="edge-dock-handle-core" />
        <span className="edge-dock-handle-shine" />
      </div>
    </div>
  );
}
