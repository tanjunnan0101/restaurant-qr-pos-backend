'use client';

import { Check, Minus, Plus, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatMoney } from '@/lib/money';
import type { CartItem, MenuItem } from '@/lib/types';
import { ProductImage } from './product-image';

export function ItemCustomizer({
  item,
  currency,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  currency: string;
  onClose: () => void;
  onAdd: (item: CartItem) => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [variantId, setVariantId] = useState(item.variants[0]?.id ?? '');
  const [selectedOptions, setSelectedOptions] = useState<Set<string>>(
    new Set(),
  );
  const [quantity, setQuantity] = useState(1);
  const [remarks, setRemarks] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    closeButton.current?.focus();
    document.body.classList.add('no-scroll');
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.classList.remove('no-scroll');
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const selectedVariant = item.variants.find(
    (variant) => variant.id === variantId,
  );
  const selectedModifierDetails = item.itemModifierGroups.flatMap(
    ({ modifierGroup }) =>
      modifierGroup.options.filter((option) => selectedOptions.has(option.id)),
  );
  const unitPrice =
    item.basePriceCents +
    (selectedVariant?.priceDeltaCents ?? 0) +
    selectedModifierDetails.reduce(
      (total, option) => total + option.priceDeltaCents,
      0,
    );

  const invalidGroupIds = useMemo(
    () =>
      new Set(
        item.itemModifierGroups
          .filter(({ modifierGroup }) => {
            const count = modifierGroup.options.filter((option) =>
              selectedOptions.has(option.id),
            ).length;
            return (
              count < modifierGroup.minSelect || count > modifierGroup.maxSelect
            );
          })
          .map(({ modifierGroup }) => modifierGroup.id),
      ),
    [item.itemModifierGroups, selectedOptions],
  );

  function toggleOption(groupIndex: number, optionId: string) {
    const group = item.itemModifierGroups[groupIndex]?.modifierGroup;
    if (!group) return;
    setSelectedOptions((current) => {
      const next = new Set(current);
      const groupOptionIds = new Set(group.options.map((option) => option.id));
      if (group.maxSelect === 1) {
        for (const id of groupOptionIds) next.delete(id);
        next.add(optionId);
        return next;
      }
      if (next.has(optionId)) {
        next.delete(optionId);
      } else {
        const selectedCount = [...next].filter((id) =>
          groupOptionIds.has(id),
        ).length;
        if (selectedCount < group.maxSelect) next.add(optionId);
      }
      return next;
    });
  }

  function submit() {
    if (invalidGroupIds.size > 0) {
      setShowErrors(true);
      document
        .querySelector('.modifier-group.invalid')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    onAdd({
      cartId: crypto.randomUUID(),
      menuItemId: item.id,
      name: item.name,
      imageUrl: item.imageUrl,
      variantId: selectedVariant?.id,
      variantName: selectedVariant?.name,
      modifierOptionIds: selectedModifierDetails.map((option) => option.id),
      modifierNames: selectedModifierDetails.map((option) => option.name),
      remarks: remarks.trim() || undefined,
      quantity,
      unitPriceCents: unitPrice,
      taxable: item.taxable,
      serviceChargeable: item.serviceChargeable,
    });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="item-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="item-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="dialog-image">
          <ProductImage src={item.imageUrl} alt={item.name} />
          <button
            ref={closeButton}
            className="icon-button close-button"
            type="button"
            aria-label="Close item options"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>

        <div className="dialog-content">
          <div className="item-heading">
            <div>
              <p className="eyebrow">Made to order</p>
              <h2 id="item-dialog-title">{item.name}</h2>
            </div>
            <strong>{formatMoney(unitPrice, currency)}</strong>
          </div>
          {item.description && (
            <p className="item-description">{item.description}</p>
          )}

          {item.variants.length > 0 && (
            <fieldset className="modifier-group">
              <legend>
                Choose a size <span>Choose one</span>
              </legend>
              <div className="option-list">
                {item.variants.map((variant) => (
                  <label className="option-row" key={variant.id}>
                    <input
                      type="radio"
                      name="variant"
                      checked={variantId === variant.id}
                      onChange={() => setVariantId(variant.id)}
                    />
                    <span className="selection-control" aria-hidden="true">
                      <Check size={14} />
                    </span>
                    <span>{variant.name}</span>
                    <small>
                      {variant.priceDeltaCents
                        ? `+${formatMoney(variant.priceDeltaCents, currency)}`
                        : 'Included'}
                    </small>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {item.itemModifierGroups.map(({ modifierGroup }, index) => {
            const invalid = showErrors && invalidGroupIds.has(modifierGroup.id);
            return (
              <fieldset
                className={`modifier-group ${invalid ? 'invalid' : ''}`}
                key={modifierGroup.id}
              >
                <legend>
                  {modifierGroup.name}
                  <span>
                    {modifierGroup.minSelect > 0
                      ? `Choose ${modifierGroup.minSelect}${modifierGroup.maxSelect > modifierGroup.minSelect ? `-${modifierGroup.maxSelect}` : ''}`
                      : `Up to ${modifierGroup.maxSelect}`}
                  </span>
                </legend>
                {invalid && (
                  <p className="field-error" role="alert">
                    Please complete this choice.
                  </p>
                )}
                <div className="option-list">
                  {modifierGroup.options.map((option) => (
                    <label className="option-row" key={option.id}>
                      <input
                        type={
                          modifierGroup.maxSelect === 1 ? 'radio' : 'checkbox'
                        }
                        name={`modifier-${modifierGroup.id}`}
                        checked={selectedOptions.has(option.id)}
                        onChange={() => toggleOption(index, option.id)}
                      />
                      <span className="selection-control" aria-hidden="true">
                        <Check size={14} />
                      </span>
                      <span>{option.name}</span>
                      <small>
                        {option.priceDeltaCents
                          ? `+${formatMoney(option.priceDeltaCents, currency)}`
                          : 'Included'}
                      </small>
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          })}

          <label className="remarks-field" htmlFor="item-remarks">
            <span>Special request</span>
            <small>We will do our best to accommodate it.</small>
            <textarea
              id="item-remarks"
              maxLength={500}
              rows={3}
              placeholder="Less spicy, sauce on the side..."
              value={remarks}
              onChange={(event) => setRemarks(event.target.value)}
            />
          </label>
        </div>

        <footer className="dialog-footer">
          <div className="quantity-stepper" aria-label="Quantity">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={quantity === 1}
              onClick={() => setQuantity((value) => Math.max(1, value - 1))}
            >
              <Minus size={18} />
            </button>
            <strong>{quantity}</strong>
            <button
              type="button"
              aria-label="Increase quantity"
              onClick={() => setQuantity((value) => Math.min(99, value + 1))}
            >
              <Plus size={18} />
            </button>
          </div>
          <button
            className="primary-button add-button"
            type="button"
            onClick={submit}
          >
            Add to order
            <span>{formatMoney(unitPrice * quantity, currency)}</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
