import * as React from "react";
import { useState, type ChangeEventHandler } from "react";
import "./app.css";

const App = () => {
  const [count, setCount] = useState(5);
  const create = () => {
    parent.postMessage(
      { pluginMessage: { type: "create-rectangles", count: count } },
      "*"
    );
  };

  const cancel = () => {
    parent.postMessage({ pluginMessage: { type: "cancel" } }, "*");
  };

  const onchange: ChangeEventHandler<HTMLInputElement> = (e) => {
    const target = e.target;
    if (!target) return;
    setCount(Number(target.value));
  };
  return (
    <div className="main-wrapper">
      <h2>Rectangle Creator</h2>
      Count: <input value={count} onChange={onchange} />
      <div className="operate">
        <button onClick={create}>
          Create
        </button>
        <button onClick={cancel}>Cancel</button>
      </div>
    </div>
  );
};

export default App;
