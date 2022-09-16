export const CirclePlus = ({ className = '' }: { className?: string }) => {
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
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8 16C12.4183 16 16 12.4183 16 8C16 3.58172 12.4183 0 8 0C3.58172 0 0 3.58172 0 8C0 12.4183 3.58172 16 8 16ZM12.25 8C12.25 7.58579 11.9142 7.25 11.5 7.25H8.75V4.5C8.75 4.08579 8.41421 3.75 8 3.75C7.58579 3.75 7.25 4.08579 7.25 4.5V7.25H4.5C4.08579 7.25 3.75 7.58579 3.75 8C3.75 8.41421 4.08579 8.75 4.5 8.75H7.25V11.5C7.25 11.9142 7.58579 12.25 8 12.25C8.41421 12.25 8.75 11.9142 8.75 11.5V8.75H11.5C11.9142 8.75 12.25 8.41421 12.25 8Z"
      />
    </svg>
  );
};

