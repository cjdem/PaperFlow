'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

export interface DropdownMenuItem {
  label: string;
  icon?: string | ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  danger?: boolean; // 别名，兼容旧代码
}

export interface DropdownMenuProps {
  trigger: ReactNode;
  items: (DropdownMenuItem | 'separator')[];
  align?: 'left' | 'right';
  className?: string;
}

export default function DropdownMenu({
  trigger,
  items,
  align = 'right',
  className = ''
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // ESC 键关闭菜单
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const handleItemClick = (item: DropdownMenuItem) => {
    if (item.disabled) return;
    item.onClick();
    setIsOpen(false);
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {/* 触发器 */}
      <div
        ref={triggerRef}
        onClick={() => setIsOpen(!isOpen)}
        className="cursor-pointer"
      >
        {trigger}
      </div>

      {/* 下拉菜单 - Fluent 2 增强风格 */}
      {isOpen && (
        <div
          ref={menuRef}
          className={`fluent-dropdown-menu ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {items.map((item, index) => {
            if (item === 'separator') {
              return (
                <div
                  key={`separator-${index}`}
                  className="fluent-dropdown-divider"
                />
              );
            }

            const isDisabled = item.disabled;
            const isDanger = item.variant === 'danger' || item.danger;

            return (
              <button
                key={index}
                onClick={() => handleItemClick(item)}
                disabled={isDisabled}
                className={`fluent-dropdown-item ${
                  isDisabled
                    ? 'opacity-50 cursor-not-allowed'
                    : isDanger
                    ? 'fluent-dropdown-item-danger'
                    : ''
                }`}
              >
                {item.icon && (
                  <span className="fluent-dropdown-item-icon">
                    {typeof item.icon === 'string' ? item.icon : item.icon}
                  </span>
                )}
                <span className="font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}