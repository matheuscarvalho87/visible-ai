import { FiMinus, FiPlus } from 'react-icons/fi';

interface FontSizeControlProps {
  onIncrease: () => void;
  onDecrease: () => void;
  disabled?: boolean;
}

const FontSizeControl = ({ onIncrease, onDecrease, disabled = false }: FontSizeControlProps) => {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={onDecrease}
        disabled={disabled}
        className="header-icon text-gray-900 hover:text-gray-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Decrease font size"
        tabIndex={0}>
        <FiMinus size={18} />
      </button>
      <button
        type="button"
        onClick={onIncrease}
        disabled={disabled}
        className="header-icon text-gray-900 hover:text-gray-700 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Increase font size"
        tabIndex={0}>
        <FiPlus size={18} />
      </button>
    </div>
  );
};

export default FontSizeControl;
