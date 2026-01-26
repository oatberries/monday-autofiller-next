'use client'

import React from "react";
import { monday } from "./lib/mondayclient";
import { useState, useEffect, useRef } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
import { ITEM_NAME_AND_VALUES, FILE_URL, ORDER_TYPES, FILE_NAMES, TEMPLATE_BOARD_AND_GROUP, API_VERSION} from "./lib/queries";
import { runQuery } from "./lib/monday";
import { Checkbox, Accordion, AccordionItem, AttentionBox, Button, Loader, Skeleton, Flex, Info } from "@vibe/core";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";
import { Analytics } from "@vercel/analytics/next"


const WANTED_TITLES = ["CSP", "DR#", "Type of Case", "Petitioner", "Respondent"];
const TEMPLATE_BOARD_NAME = "TRA Templates";
const ORDER_GROUP_TITLE = "Orders";
const ORDER_TYPES_CACHE_KEY = "orderTypesCache_v1";


function fillTemplate(ab, { petitioner, respondent, csp, drNumber }, filename = "output.docx") {

  const uint8 = new Uint8Array(ab);
  const zip = new PizZip(uint8);

  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
  });

  
  doc.setData({
    petitioner,
    respondent,
    csp,
    drNumber,
  });

  try {
    doc.render();
  } catch (error) {
    console.error("Docxtemplater render error:", error);
    throw new Error("Failed to render template");
  }

  const out = doc.getZip().generate({
    type: "arraybuffer",
  });

  const blob = doc.getZip().generate(
    {
      type: "blob",
      mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
  );

  saveAs(blob, filename);

  return out;
}

async function getSelectedDocPublicUrl(templateItemId, docName) {
  
  const data = await runQuery(FILE_URL, { itemId: [templateItemId] });

  const assets = data?.items?.[0]?.assets || [];

  //Find the asset whose name matches the selected doc name
  const asset = assets.find((a) => a.name === docName);

  if (!asset?.public_url) {
    throw new Error("No file with a public URL found for the selected document.");
  }

  return asset.public_url;
}

async function fetchArrayBufferViaProxy(publicUrl) {
  const r = await fetch(`/api/file-proxy?u=${encodeURIComponent(publicUrl)}`);
  if (!r.ok) throw new Error(`Proxy fetch failed: ${r.status}`);
  return r.arrayBuffer();
}


export default function Page() {
  
  const [boardId, setBoardId] = useState(null);
  const [itemId, setItemId] = useState(null);

  const[petitioner, setPetitioner] = useState(null);
  const[respondent, setRespondent] = useState(null);
  const [csp, setCsp] = useState(null);
  const [drNumber, setDRNumber] = useState(null);

  const [error, setError] = useState("");
  const [templateBoardId, setTemplateBoardId] = useState(null);
  const [templateGroupId, setTemplateGroupId] = useState(null);
  const [templateItemId, setTemplateItemId] = useState(null);
  const [orderTypes, setOrderTypes] = useState([]);
  const [openOrderType, setOpenOrderType] = useState(null);
  const [docNamesByItem, setDocNamesByItem] = useState({});
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [fillingDoc, setFillingDoc] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchContext() {

      try {
        console.time("OPEN CASES BOARD ID AND ITEM ID");
        const { data } = await monday.get("context"); 
        console.timeEnd("OPEN CASES BOARD ID AND ITEM ID");
        setBoardId(data.boardId);
        setItemId(data.itemId);

        const versionQuery = await runQuery(API_VERSION); 
        const version = versionQuery?.version;
        const value = version?.value;
        console.log("The api version is:", value); 

      } catch (err) {
        console.error("Error getting context:", err);
      }
    }

    fetchContext();
  }, []);
  
  /*
  //this use effect is to give this app a lil speed boost by finding the template board and group id right from the start
  useEffect(() => {
  async function resolveTemplateBoardAndGroup() {
    try {
      console.time("CACHED TEMPLATE BOARD AND GROUP");
      const data = await runQuery(TEMPLATE_BOARD_AND_GROUP);
      console.timeEnd("CACHED TEMPLATE BOARD AND GROUP");

      const boards = data?.boards ?? [];

      const templateBoard = boards.find(
        (b) =>
          b.name &&
          b.name.trim().toLowerCase() === TEMPLATE_BOARD_NAME.toLowerCase()
      );

      if (!templateBoard) {
        console.error("Template board not found");
        return;
      }

      const templateGroup = (templateBoard.groups ?? []).find(
        (g) =>
          g.title &&
          g.title.trim().toLowerCase() === ORDER_GROUP_TITLE.toLowerCase()
      );

      if (!templateGroup) {
        console.error("Template group not found");
        return;
      }

      setTemplateBoardId(Number(templateBoard.id));
      setTemplateGroupId(templateGroup.id);
    } catch (err) {
      console.error("[TemplateBoardAndGroup] failed:", err);
      setError("Failed to resolve template board/group.");
    }
  }

    resolveTemplateBoardAndGroup();
    
  }, []);
*/
  useEffect(() => {
    if (!itemId) return;

    (async () => {
      try {
        console.time("SPECIFIC OPEN CASES VALUES- RESPONDENT, ETC..");
        const data = await runQuery(ITEM_NAME_AND_VALUES, { itemId: [itemId] });
        console.timeEnd("SPECIFIC OPEN CASES VALUES- RESPONDENT, ETC..");

        const item = data?.items?.[0];
        const cvs = item?.column_values ?? [];

        const wanted = cvs.filter(cv => WANTED_TITLES.includes(cv?.column?.title));
        const byTitle = Object.fromEntries(
          wanted.map(cv => [cv.column.title, cv.text ?? ""])
        );

        setPetitioner(byTitle["Petitioner"] ?? "");
        setRespondent(byTitle["Respondent"] ?? "");
        setCsp(byTitle["CSP"] ?? "");
        setDRNumber(byTitle["DR#"] ?? "");

      } catch (e) {
        setError(e.message || "Failed to fetch item values");
        console.error(e);
      }
    })();

  }, [itemId]);

  useEffect(() => {
  if (!templateBoardId || !templateGroupId) return;

  let cancelled = false;

  async function fetchOrderTypes() {
    try {

      console.time("storage:get ORDER_TYPES");
      const cached = await monday.storage.getItem(ORDER_TYPES_CACHE_KEY);
      console.timeEnd("storage:get ORDER_TYPES");

      console.log(
        "[TRA] Cached order types (raw):",
        cached
      );

      console.log(
        "[TRA] Cached order types (value):",
        JSON.stringify(cached?.data?.value, null, 2)
      );

      if (!cancelled && Array.isArray(cached?.data?.orders)) {
        setOrderTypes(cached.data.orders);
        return;
      }

      console.log("[TRA] Cache empty -> Fetching order types via GraphQL");
      console.time("FETCH ORDER TYPES");
      const data = await runQuery(ORDER_TYPES, {
        boardIds: [templateBoardId],
        groupIds: [templateGroupId],
      });
      console.timeEnd("FETCH ORDER TYPES");

      const boards = data?.boards ?? [];
      const groups = boards[0]?.groups ?? [];
      const group = groups[0];
      const items = group?.items_page?.items ?? [];

      if (!cancelled) {
        setOrderTypes(items);
      }

      setLoading(false);

      console.log("[TRA] Saving order types to storage:", items);

      const writeResult= await monday.storage.setItem(ORDER_TYPES_CACHE_KEY, {
        orders: items,
      });

      console.log("[TRA] Write result:", writeResult);
      
    } catch (err) {
      if (!cancelled) {
        console.error("Error fetching order types:", err);
        setError("Failed to fetch order types.");
      }
    }
  }

  fetchOrderTypes();

  return () => {
    cancelled = true;
  };

}, [templateBoardId, templateGroupId]);


  useEffect(() => {
  if (!templateItemId) return;

  async function fetchFileNames() {
    try {

      console.time("START: FETCH FILE NAMES");
      const data = await runQuery(FILE_NAMES, { itemId: [templateItemId] });

      const assets = data?.items?.[0]?.assets ?? [];

      const docs = assets.map(a => ({
        name: a.name,
        isDocx:
          (a.file_extension && a.file_extension.toLowerCase() === "docx") ||
          a.name.toLowerCase().endsWith(".docx"),
      }));

      setDocNamesByItem(prev => ({
        ...prev,
        [templateItemId]: docs,
      }));

    } catch (err) {
      console.error("Error getting file names:", err);
    }
  }

  fetchFileNames();
  console.timeEnd("END: FETCH FILE NAMES");
}, [templateItemId]);

async function handleFillAndDownloadClick() {

  if (selectedDocs.length === 0) {
    setError("Please select at least one document first.");
    return;
  }

  setError("");
  setFillingDoc(true);

  try {

    for (const { itemId: templateItemId, docName } of selectedDocs) {

    const publicUrl = await getSelectedDocPublicUrl(templateItemId, docName);

    const ab = await fetchArrayBufferViaProxy(publicUrl);

    await fillTemplate(ab, {
      petitioner: petitioner || "",
      respondent: respondent || "",
      csp: csp || "",
      drNumber: drNumber || "",
    }, docName);

  }
  } catch (e) {
    console.error(e);
    setError(e.message || "Failed to fill and download documents.");
  } finally {
    setFillingDoc(false);
  }
}

function toggleDocSelection(itemId, docName) {
  setSelectedDocs(prev => {
    const exists = prev.find(
      d => d.itemId === itemId && d.docName === docName
    );

    if (exists) {
      return prev.filter(
        d => !(d.itemId === itemId && d.docName === docName)
      );
    }

    return [...prev, { itemId, docName }];
  });
}


  useEffect(() => {
    monday.execute("valueCreatedForUser");
  }, []);

    const groupedSelectedDocs = selectedDocs.reduce((acc, { itemId, docName }) => {
    const order = orderTypes.find((o) => o.id === itemId);
    const orderLabel = order ? order.name : `Order ${itemId}`;

    if (!acc[orderLabel]) {
      acc[orderLabel] = [];
    }
    acc[orderLabel].push(docName);

    return acc;
  }, {});

  
  useEffect(() => {
  (async () => {
    console.log("[TRA] Running storage smoke test…");

    try {
      const readBefore = await monday.storage.getItem("tra_debug_test");
      console.log("[TRA] Before set, tra_debug_test =", readBefore);

      await monday.storage.setItem("tra_debug_test", {
        savedAt: new Date().toISOString(),
      });

      const readAfter = await monday.storage.getItem("tra_debug_test");
      console.log("[TRA] After set, tra_debug_test =", readAfter);
    } catch (err) {
      console.error("[TRA] Storage smoke test ERROR:", err);
    }
  })();
}, []);


  return (
    <div className="App tra-root">
      <div className="tra-shell">
        <header className="tra-header">
          <div>
            <h1 className="tra-title">TRA Document Filler</h1>
            <p className="tra-subtitle">
              Select order types and .docx templates to auto-fill with this item&apos;s data.
            </p>
          </div>
          <div className="how-to">
            <Info
              aria-label="How To Use"
              body={
              <div>
                <ol style={{ margin: 0, paddingLeft: 18 }}>
                  <li>Expand an order type and choose one or more .docx templates.</li>
                  <li>Click <b>Fill &amp; download selected docs</b> to prepare and download them.</li>
                  <li>
                    If a template doesn’t appear for download, confirm it exists in <b>TRA Templates</b> → <b>Orders</b> and contains
                    these placeholders exactly: <code>{`{petitioner}`}</code>, <code>{`{respondent}`}</code>,{" "}
                    <code>{`{drNumber}`}</code>, <code>{`{csp}`}</code>, in the places where those values are expected to appear.
                  </li>
                </ol>
              </div>
            }
              id="overview-info"
              onDialogHide={function Xs(){}}
              onDialogShow={function Xs(){}}
              title="How to use this application:"
            />
            </div>

          {fillingDoc && (
            <span className="tra-status-tag">Working…</span>
          )}
        </header>

        <main className="tra-layout">
          {/* LEFT COLUMN: Order types & templates */}
          <section className="tra-column tra-column--orders">
            <h2 className="tra-section-title">Order types</h2>

            <div className="tra-card tra-card--scroll">
              {loading ? (
                <div>
                <Flex
                  direction="column"
                  gap="small"
                >
                  <Skeleton
                    id="overview-skeleton-1"
                    size="h1"
                    type="text"
                    fullWidth="true"
                    height={56}
                  />
                  <Skeleton
                    id="overview-skeleton-2"
                    size="h1"
                    type="text"
                    fullWidth="true"
                    height={56}
                  />
                  <Skeleton
                    id="overview-skeleton-3"
                    size="h1"
                    type="text"
                    fullWidth="true"
                    height={56}
                  />
                  <Skeleton
                    id="overview-skeleton-4"
                    size="h1"
                    type="text"
                    fullWidth="true"
                    height={56}
                  />
                  <Skeleton
                    id="overview-skeleton-5"
                    size="h1"
                    type="text"
                    fullWidth="true"
                    height={56}
                  />
                  <Skeleton
                    id="overview-skeleton-6"
                    size="h1"
                    type="text"
                    fullWidth="true"
                    height={56}
                  />
                  <Skeleton
                    id="overview-skeleton-7"
                    size="h1"
                    type="text"
                    fullWidth="true"
                    height={56}
                  />
                </Flex>
                </div>
                ) : (
              
              <Accordion id="orderTypeList">
                {orderTypes.map((order) => (
                  <AccordionItem
                    key={order.id}
                    title={order.name}
                    onClick={() => {
                      setOpenOrderType(order.id);
                      setTemplateItemId(order.id);
                    }}
                  >
                    {openOrderType === order.id && (
                      <div className="tra-doc-list">
                        {(docNamesByItem[order.id] || []).length === 0 ? (
                          <div className="tra-empty-text">
                            No documents attached to this order type.
                          </div>
                        ) : (
                          (docNamesByItem[order.id] || []).map(({ name: label, isDocx }) => (
                            <div
                              key={label}
                              className="tra-doc-row"
                            >
                              <Checkbox
                                label={label}
                                disabled={!isDocx}
                                checked={
                                  isDocx &&
                                  selectedDocs.some(
                                    (d) => d.itemId === order.id && d.docName === label
                                  )
                                }
                                onChange={() => {
                                  if (isDocx) {
                                    toggleDocSelection(order.id, label);
                                  }
                                }}
                                ariaLabel={label}
                              />

                              {!isDocx && (
                                <span className="tra-doc-warning">
                                  This file must be .docx to be autofilled
                                </span>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </AccordionItem>
                ))}
              </Accordion>
              )}
            </div>
          </section>

          {/* RIGHT COLUMN: Item details, selection summary, actions */}
          <section className="tra-column tra-column--details">
            {/* Error box */}
            {error && (
              <div className="tra-card">
                <AttentionBox
                  title="Something went wrong"
                  text={error}
                  type={AttentionBox.types.DANGER}
                />
              </div>
            )}

            {/* Current item fields */}

{/*
            <div className="tra-card">
              <h2 className="tra-section-title">Current item fields</h2>
              <dl className="tra-fields-grid">
                <div>
                  <dt>Board ID</dt>
                  <dd>{boardId || "—"}</dd>
                </div>
                <div>
                  <dt>Item ID</dt>
                  <dd>{itemId || "—"}</dd>
                </div>
                <div>
                  <dt>Petitioner</dt>
                  <dd>{petitioner || "—"}</dd>
                </div>
                <div>
                  <dt>Respondent</dt>
                  <dd>{respondent || "—"}</dd>
                </div>
                <div>
                  <dt>CSP</dt>
                  <dd>{csp || "—"}</dd>
                </div>
                <div>
                  <dt>DR#</dt>
                  <dd>{drNumber || "—"}</dd>
                </div>
              </dl>
            </div>
*/}
            {/* Selected docs summary */}
            {selectedDocs.length > 0 && (
              <div className="tra-card">
                <h2 className="tra-section-title">Selected documents</h2>
                <ul className="tra-selected-list">
                  {Object.entries(groupedSelectedDocs).map(([orderLabel, docs]) => (
                    <li key={orderLabel} className="tra-selected-group">
                      <span className="tra-selected-order">{orderLabel}</span>
                      <ul className="tra-selected-docs">
                        {docs.map((name) => (
                          <li key={orderLabel + name}>{name}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Primary action */}
            <div className="tra-footer">
              <Button
                onClick={handleFillAndDownloadClick}
                disabled={selectedDocs.length === 0 || fillingDoc}
                size={Button.sizes.LARGE}
              >
                {fillingDoc ? "Filling documents..." : "Fill & download selected docs"}
              </Button>
              {selectedDocs.length === 0 && (
                <span className="tra-footer-hint">
                  Select at least one .docx template from the list on the left.
                </span>
              )}
            </div>

            <div className="diagnostic-panel">

            </div>
          </section>
        </main>
      </div>
    </div>
  );
}


