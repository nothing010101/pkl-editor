export default function SectionNav({ pages, activeId, onSelect, onAddPage, onRenamePage, onDeletePage, doneIds }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-none flex-1">
        {pages.map((p) => {
          const isActive = p.id === activeId;
          const isDone = doneIds.has(p.id);
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition
                ${isActive
                  ? 'bg-neutral-100 text-neutral-900 border-neutral-100'
                  : isDone
                  ? 'bg-neutral-800 text-neutral-200 border-neutral-700'
                  : 'bg-transparent text-neutral-500 border-neutral-800'}`}
            >
              {p.title}
              {isActive && (
                <span className="flex items-center gap-1">
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRenamePage(p);
                    }}
                    className="opacity-60 hover:opacity-100"
                  >
                    ✎
                  </span>
                  {pages.length > 1 && (
                    <span
                      role="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeletePage(p);
                      }}
                      className="opacity-60 hover:opacity-100"
                    >
                      ✕
                    </span>
                  )}
                </span>
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={onAddPage}
        className="shrink-0 bg-neutral-800 text-neutral-100 rounded-full w-8 h-8 text-sm font-medium mb-2"
      >
        +
      </button>
    </div>
  );
}
