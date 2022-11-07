import type { ReactNode } from 'react';

import { ApproveModalProps, TransactionState } from '../types';

import { CircleClose } from './Icons';

const ApproveModal = ({ asset, transactionKey, transactionTracker, onActionClicked, onRequestClose }: ApproveModalProps) => {
  let title: string;
  let text: string;
  let button: ReactNode;
  const transaction = transactionTracker.get(transactionKey);

  if (transaction === undefined) {
    title = `Enable ${asset.name}`;
    text = `To migrate your ${asset.symbol} balance to Compound V3, you need to grant the migration tool permission to manage your ${asset.symbol} balance on Compound V2.`
    button = (
      <button
        className="button button--x-large button--supply"
        onClick={() => {
          onActionClicked(asset, `Enable ${asset.name}`);
        }}
      >
        Enable {asset.symbol}
      </button>
    );
  } else if (transaction.state === TransactionState.AwaitingConfirmation) {
    title = `Enable ${asset.name}`;
    text = `To migrate your ${asset.symbol} balance to Compound V3, you need to grant the migration tool permission to manage your ${asset.symbol} balance on Compound V2.`
    button = (
      <button className="button button--x-large button--supply" disabled>
        Confirm Transaction
      </button>
    );
  } else {
    return null;
  }

  return (
    <div className="modal">
      <div className="modal__backdrop" onClick={onRequestClose}></div>
      <div className="modal__content L4">
        <div className="modal__content__header">
          <div className="modal__content__header__left"></div>
          <h4 className="heading heading--emphasized heading">{title}</h4>
          <div className="modal__content__header__right" onClick={onRequestClose}>
            <CircleClose />
          </div>
        </div>
        <div className="modal__content__icon-holder">
          <div className={`modal__content__icon asset asset--${asset.symbol}`}></div>
        </div>
        <div className="modal__content__paragraph">
          <p className="body">{text}</p>
        </div>
        <div className="modal__content__action-row">{button}</div>
      </div>
    </div>
  );
};

export default ApproveModal;
