export default function Icon({ name, filled = false, className = '' }) {
  return (
    <span className={`icon ${filled ? 'icon-fill' : ''} ${className}`} aria-hidden="true">
      {name}
    </span>
  );
}
