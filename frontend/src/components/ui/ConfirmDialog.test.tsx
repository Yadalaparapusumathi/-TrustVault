import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  it('requires typing the exact confirmation text', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        tone="danger"
        title="Delete permanently?"
        confirmLabel="Delete forever"
        requireText="Board minutes.pdf"
        onConfirm={onConfirm}
        onClose={() => undefined}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete forever' });
    expect(confirm).toBeDisabled();
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'Board minutes' } });
    expect(confirm).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Board minutes.pdf' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it('renders nothing when closed', () => {
    render(<ConfirmDialog open={false} title="x" onConfirm={() => undefined} onClose={() => undefined} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
