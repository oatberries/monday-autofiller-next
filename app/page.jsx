'use client'

import React from "react";
import { useState, useEffect, useRef } from "react";
import "./App.css";
import mondaySdk from "monday-sdk-js";
import "@vibe/core/tokens";
//Explore more Monday React Components here: https://vibe.monday.com/
import { AttentionBox, Button } from "@vibe/core";
import { ITEM_NAME_AND_VALUES, BOARD_NAME,FILE_URL, ORDER_TYPES, FILE_NAMES} from "./lib/queries";
import { runQuery } from "./lib/monday";
import { Checkbox, Accordion, AccordionItem } from "@vibe/core";
import { renderAsync } from "docx-preview";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { saveAs } from "file-saver";

// Usage of mondaySDK example, for more information visit here: https://developer.monday.com/apps/docs/introduction-to-the-sdk/
const monday = mondaySdk();
const WANTED_TITLES = ["CSP", "DR#", "Type of Case", "Petitioner", "Respondent"];
const TEMPLATE_BOARD_NAME = "TRA Templates";
const ORDER_GROUP_TITLE = "Orders";

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

  //Return a new ArrayBuffer representing the filled DOCX
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

  return asset.public_url; //short-lived; we’ll fetch it immediately via proxy
}

async function fetchArrayBufferViaProxy(publicUrl) {
  // Your existing API route that bypasses CORS & auth issues
  const r = await fetch(`/api/file-proxy?u=${encodeURIComponent(publicUrl)}`);
  if (!r.ok) throw new Error(`Proxy fetch failed: ${r.status}`);
  return r.arrayBuffer();
}


export default function Page() {
  
  const [context, setContext] = useState();
  const [boardId, setBoardId] = useState(null);
  const [itemId, setItemId] = useState(null);

  const[petitioner, setPetitioner] = useState(null);
  const[respondent, setRespondent] = useState(null);
  const [csp, setCsp] = useState(null);
  const [drNumber, setDRNumber] = useState(null);

  const[publicUrl, setPublicUrl] = useState(null);
  const [error, setError] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const previewRef = useRef(null); // container for the preview
  const [templateBoardId, setTemplateBoardId] = useState(null);
  const [templateGroupId, setTemplateGroupId] = useState(null);
  const [templateItemName, setTemplateItemName] = useState(null);
  const [templateItemId, setTemplateItemId] = useState(null);
  //const [orderTypes, setOrderTypes] = useState([{orderTypes: ''}]);
  const [orderTypes, setOrderTypes] = useState([]);
  const [orderId, setOrderId] = useState(null);
  const [document, setDocuments] = useState([{documents: ''}]);
  const [openOrderType, setOpenOrderType] = useState(null);
  //const [docNames, setDocNames] = useState([]);
  const [docNamesByItem, setDocNamesByItem] = useState({});
  //const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedDocs, setSelectedDocs] = useState([]);
  const [fillingDoc, setFillingDoc] = useState(false);




  // KEEP: this fetches the boardId for the board that we need the petitioner, respondent, csp, and dr number
  useEffect(() => {
    async function fetchContext() {
      try {
        const { data } = await monday.get("context"); 
        setBoardId(data.boardId);
        setItemId(data.itemId);
      } catch (err) {
        console.error("Error getting context:", err);
      }
    }

    fetchContext();
    
  }, []);

  //KEEP: here we extract the values that we need to fill the template with
  useEffect(() => {
    if (!itemId) return;

    (async () => {
      try {
        const data = await runQuery(ITEM_NAME_AND_VALUES, { itemId: [itemId] });
        const item = data?.items?.[0];
        const cvs = item?.column_values ?? [];

        //Keep only CSP, DR#, Respondent, and Petitioner
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

  //New function: here we're gonna extract the names of each order type
  useEffect(() =>{
    async function fetchOrderTypes() {
      try{
        const data = await runQuery(ORDER_TYPES);
        console.log(data);

        const boards = data.boards;

        const templateBoard = boards.find(
        (b) => b.name.trim().toLowerCase() === TEMPLATE_BOARD_NAME.toLowerCase()
        );

        if(!templateBoard){
          console.error("Template board not found!");
        }
        //setTemplateBoardId(templateBoard.id);

        const templateGroup = templateBoard.groups.find(
          (g) => g.title.trim().toLowerCase() === ORDER_GROUP_TITLE.toLowerCase()
        );
        
        if(!templateGroup){
          console.error("Template group not found");
        }
        //setTemplateGroupId(templateGroup.id);
        
        const items = templateGroup.items_page?.items ?? [];
        //orderTypes should now be an array of the names of the different orders

        //const orders = items.map(item => item.name);
        const orders = items;
        //orderTypes will be an array of objects with the itemId and item name
        /*const orders = items.map(item => ({
          id: item.id,
          name: item.name,
        }));
        */

        setOrderTypes(orders);

      } catch(err){
        console.error("Error getting context:", err);
      }
    }

    fetchOrderTypes();
  }, [TEMPLATE_BOARD_NAME, ORDER_GROUP_TITLE]);

  useEffect(() => {
  // If we don't have an item id yet, do nothing
  if (!templateItemId) return;

  async function fetchFileNames() {
    try {
      const data = await runQuery(FILE_NAMES, { itemId: [templateItemId] });

      //data.items is an array; we want the first item's assets
      const assets = data?.items?.[0]?.assets ?? [];

      //Grab the asset names
      const names = assets.map(a => a.name);

      //setDocNames(names);
      setDocNamesByItem(prev => ({
        ...prev,
        [templateItemId]: names,
      }));

    } catch (err) {
      console.error("Error getting file names:", err);
    }
  }

  fetchFileNames();
}, [templateItemId]);

async function handleFillAndDownloadClick() {
  /*
  if (!templateItemId || !selectedDoc) {
    setError("Please select an order type and a document first.");
    return;
  }
*/

  if (selectedDocs.length === 0) {
    setError("Please select at least one document first.");
    return;
  }

  /*
  if (!templateItemId || selectedDocs.length === 0) {
    setError("Please select an order type and at least one document first.");
    return;
  }
*/
  setError("");
  setFillingDoc(true);

  try {

    //for (const docName of selectedDocs) {
    for (const { itemId: templateItemId, docName } of selectedDocs) {

    //Get the public URL for the asset matching `selectedDoc`
    const publicUrl = await getSelectedDocPublicUrl(templateItemId, docName);

    //Download the DOCX bytes through your proxy
    const ab = await fetchArrayBufferViaProxy(publicUrl);

    //Fill the template with the current item’s values
    await fillTemplate(ab, {
      petitioner: petitioner || "",
      respondent: respondent || "",
      csp: csp || "",
      drNumber: drNumber || "",
    }, docName);

  }
    //`fillTemplate` already calls `saveAs(blob, "output.docx")`,
    //so the user will get a download automatically here.
  } catch (e) {
    console.error(e);
    setError(e.message || "Failed to fill and download documents.");
  } finally {
    setFillingDoc(false);
  }
}
/*
function toggleDocSelection(docName) {
  setSelectedDocs((prev) =>
    prev.includes(docName)
      ? prev.filter((d) => d !== docName) //uncheck
      : [...prev, docName]               //check
  );
}
*/
function toggleDocSelection(itemId, docName) {
  setSelectedDocs(prev => {
    const exists = prev.find(
      d => d.itemId === itemId && d.docName === docName
    );

    if (exists) {
      //uncheck: remove that pair
      return prev.filter(
        d => !(d.itemId === itemId && d.docName === docName)
      );
    }

    //check: add new pair
    return [...prev, { itemId, docName }];
  });
}


/*
  useEffect(() =>{

    async function retrieveFileNames() {
    
    try{
      const data = await runQuery(FILE_NAMES, { itemId: [templateItemId] });

      const items = data?.items;
      const assets = items?.assets;

      const assetNames = assets.map(assets => assets.names);

      setDocNames(assetNames);

    }
    catch(err){
      //console.error("Error getting file names:", err);
    }

  }

  retrieveFileNames();
  },);
*/
  //function handleOnClick(){
    //setSelectedDoc(order);
  //}
/*
  useEffect(() => {
    async function fetchTemplateContext(){
      try{
        const data = await runQuery(BOARD_NAME);
        const boards = data?.boards ?? [];

        const templateBoard = boards.find(
        (b) => b.name.trim().toLowerCase() === TEMPLATE_BOARD_NAME.toLowerCase()
        );
        
        if(!templateBoard){
          console.error("Template board not found!");
        }
        setTemplateBoardId(templateBoard.id);

        const templateGroup = templateBoard.groups.find(
          (g) => g.title.trim().toLowerCase() === ORDER_GROUP_TITLE.toLowerCase()
        );
        
        if(!templateGroup){
          console.error("Template group not found");
        }
        setTemplateGroupId(templateGroup.id);

        const items = templateGroup.items_page?.items ?? [];
        const templateItem = items.find(
          (i) => i.name.trim().toLowerCase() === templateItemName.toLowerCase()
        );

        if(!templateItem){
          console.error("Template item not found!");
        }
        setTemplateItemId(templateItem.id);

      }catch(err){
        console.error("Error getting template context:", err);
      }
    }

    fetchTemplateContext();
  }, [TEMPLATE_BOARD_NAME, ORDER_GROUP_TITLE, templateItemName]);
*/

/*
  async function getDocxPublicUrl(templateItemId) {
    const data = await runQuery(FILE_URL, { itemId: [templateItemId] });
    const assets = data?.items?.[0]?.assets || [];
    const docx = assets.find(a => (a.file_extension || "").toLowerCase() === ".docx");
    if (!docx?.public_url) {
      throw new Error("No .docx with a public_url found on this item.");
    }
    setPublicUrl(docx.public_url);
    return docx.public_url; // short-lived; fetch immediately via proxy
  }

  async function fetchArrayBufferViaProxy(publicUrl) {
    const r = await fetch(`/api/file-proxy?u=${encodeURIComponent(publicUrl)}`);
    if (!r.ok) throw new Error(`Proxy fetch failed: ${r.status}`);
    return r.arrayBuffer();
  }

  //Click handler to preview the DOCX
  async function handlePreviewClick() {
    if (!itemId) return;
    setLoadingPreview(true);
    setError("");

    try {
      const publicUrl = await getDocxPublicUrl(templateItemId);
      const ab = await fetchArrayBufferViaProxy(publicUrl);

       //Fill the template with current item values
      const filledAb = fillTemplate(ab, {
        petitioner: petitioner || "",
        respondent: respondent || "",
        csp: csp || "",
        drNumber: drNumber || "",
      });

      if (previewRef.current) {
        previewRef.current.innerHTML = "";
      }

      //Preview the filled doc
      await renderAsync(filledAb, previewRef.current, null, {
        inWrapper: true,
        ignoreFonts: true,
      });
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to preview document");
    } finally {
      setLoadingPreview(false);
    }
  }

*/


  useEffect(() => {
    // Notice this method notifies the monday platform that user gains a first value in an app.
    // Read more about it here: https://developer.monday.com/apps/docs/mondayexecute#value-created-for-user/
    monday.execute("valueCreatedForUser");

    // TODO: set up event listeners, Here`s an example, read more here: https://developer.monday.com/apps/docs/mondaylisten/
    monday.listen("context", (res) => {
      setContext(res.data);
    });
  }, []);

  //Some example what you can do with context, read more here: https://developer.monday.com/apps/docs/mondayget#requesting-context-and-settings-data
  //const attentionBoxText = `Hello! Board ID: ${boardId ?? "loading"}, Item ID: ${itemId ?? "loading"}`;

  return (
    <div className="App" >
      <div className="scroll-container" style={{height: "100vh", overflowY: "auto", overflowX: "hidden"}}>
        <div >


      <Accordion id="orderTypeList" >
        {orderTypes.map(order =>(
          <AccordionItem
            key={order.id}
            title={order.name}
            onClick={() => {
            //set which order type is open
            setOpenOrderType(order.id), 
            //set the itemId whose docs we want to load
            setTemplateItemId(order.id)
            }} 
          >
            
              {openOrderType === order.id && (
              <div style={{ paddingLeft: 16, paddingTop: 8 }}>
{/*
                {docNames.length === 0 ? (
                  <div>No documents attached to this order type.</div>
                ) : (
                  docNames.map((doc) => (
                    <Checkbox
                      key={doc}
                      label={doc}
                      checked={selectedDocs.includes(doc)}
                      onChange={() => toggleDocSelection(doc)}
                      ariaLabel={doc}
                    />
                  ))
                )}
*/}
                {(docNamesByItem[order.id] || []).length === 0 ? (
                  <div>No documents attached to this order type.</div>
                ) : (
                  (docNamesByItem[order.id] || []).map((doc) => (
                    <Checkbox
                      key={doc}
                      label={doc}
                      checked={selectedDocs.some(
                        d => d.itemId === order.id && d.docName === doc
                      )}
                      onChange={() => toggleDocSelection(order.id, doc)}
                      ariaLabel={doc}
                    />
                  ))
                )}
              </div>
            )}
           
          </AccordionItem>
        ))}
     
      </Accordion>


    </div>
  {/*    <AttentionBox title="Hello Monday Apps!" text={attentionBoxText} type="success" />  */}

      <div style={{ padding: 16 }}>
        {error && <p style={{ color: "crimson" }}>Error: {error}</p>}
        <h2>Current Item Fields</h2>
        <p><strong>boardId:</strong> {boardId || "—"}</p>
        <p><strong>itemId:</strong> {itemId || "—"}</p>
        <p><strong>Petitioner:</strong> {petitioner || "—"}</p>
        <p><strong>Respondent:</strong> {respondent || "—"}</p>
        <p><strong>CSP:</strong> {csp || "—"}</p>
        <p><strong>DR#:</strong> {drNumber || "—"}</p>
{/*
        <div style={{ marginTop: 24, marginBottom: 12 }}>
          <Button onClick={handlePreviewClick} disabled={!itemId || loadingPreview}>
            {loadingPreview ? "Loading preview..." : "Preview DOCX template"}
          </Button>
        </div>

        <p><strong>Templates Board ID:</strong> {templateBoardId || "—"}</p>
        <p><strong>Templates Group ID:</strong> {templateGroupId || "—"}</p>
        <p><strong>Templates Item Name:</strong> {templateItemName || "—"}</p>
        <p><strong>Templates Item ID:</strong> {templateItemId || "—"}</p>
        <p><strong>DOCX Public URL:</strong> {publicUrl || "—"}</p>
*/}

        </div>   

        <div style={{ marginTop: 24 }}>
          <Button
            onClick={handleFillAndDownloadClick}
            //disabled={selectedDocs.length === 0 || !templateItemId || fillingDoc}
            //disabled={!selectedDocs || !templateItemId || fillingDoc}
            disabled={selectedDocs.length === 0 || fillingDoc}
          >
            {fillingDoc ? "Filling document..." : "Fill and download selected docs"}
          </Button>
        </div>

      </div>
    </div>
    
  );
}


