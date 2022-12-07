import { useState } from 'react';

import { ChevronDown } from './Icons';

type DropdownProps = {
  options: [string, string][];
  selectedOption: string;
  selectOption: (option: [string, string]) => void;
};

function Dropdown({ options, selectedOption, selectOption }: DropdownProps) {
  const [active, setActive] = useState(false);
  return (
    <div className={`dropdown L1${active ? ' dropdown--active' : ''}`} onClick={() => setActive(!active)}>
      <div className="dropdown__option dropdown__option--selected">
        <label className="label">{selectedOption}</label>
        <ChevronDown className="svg--icon--2" />
      </div>
      {active && (
        <div className={`dropdown__content L2`}>
          {options.map(([key, option]) => (
            <div className="dropdown__option" key={key} onClick={() => selectOption([key, option])}>
              <label className="label">{option}</label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default Dropdown;
