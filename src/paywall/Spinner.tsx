export function Spinner({ className = "" }: { className?: string }) {
  return (
    <div className={`spinner ${className}`}>
      <div />
    </div>
  );
}
