export const Wallet = ({ className = '' }: { className?: string }) => {
  return (
    <svg
      className={`svg ${className}`}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        className="svg__path"
        fillRule="evenodd"
        clipRule="evenodd"
        d="M2 7C2 5.34315 3.34315 4 5 4H18C19.1046 4 20 4.89543 20 6H5C4.44772 6 4 6.44772 4 7C4 7.55228 4.44772 8 5 8H19C20.6569 8 22 9.34315 22 11V17C22 18.6569 20.6569 20 19 20H5C3.34315 20 2 18.6569 2 17V7ZM19 15C19.5523 15 20 14.5523 20 14C20 13.4477 19.5523 13 19 13C18.4477 13 18 13.4477 18 14C18 14.5523 18.4477 15 19 15Z"
      />
    </svg>
  );
};
