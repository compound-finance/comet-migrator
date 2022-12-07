type LoadSpinnerProps = {
  size?: number;
  strokeWidth?: number;
};

const LoadSpinner = ({ size = 24, strokeWidth = 2 }: LoadSpinnerProps) => {
  return (
    <div
      className="load-spinner"
      style={{
        width: size + 'px',
        height: size + 'px',
        borderWidth: strokeWidth + 'px',
      }}
    ></div>
  );
};

export default LoadSpinner;
