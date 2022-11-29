export const ChevronDown = ({ className = '' }: { className?: string }) => {
  return (
    <svg
      className={`svg ${className}`}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="svg__path"
        d="M4.22894 5.17188L3.28613 6.11468L8.00017 10.8287L12.7142 6.1147L11.7714 5.17189L8.00018 8.94312L4.22894 5.17188Z"
      />
    </svg>
  );
};
