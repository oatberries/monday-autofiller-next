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

function fillTemplate(ab, { petitioner, respondent, csp, drNumber }) {

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

  saveAs(blob, "output.docx");

  return out;
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
  const [docNames, setDocNames] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);



  // KEEP: this fetches the boardId for the board that we need the petitioner, respondent, csp, and dr number from
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

        //Keep only CSP, DR#, Type of Case, Respondent, and Petitioner
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
        setTemplateBoardId(templateBoard.id);

        const templateGroup = templateBoard.groups.find(
          (g) => g.title.trim().toLowerCase() === ORDER_GROUP_TITLE.toLowerCase()
        );
        
        if(!templateGroup){
          console.error("Template group not found");
        }
        setTemplateGroupId(templateGroup.id);
        
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

      setDocNames(names);
    } catch (err) {
      console.error("Error getting file names:", err);
    }
  }

  fetchFileNames();
}, [templateItemId]);

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
      <div className="scroll-container" style={{height: "100vh", autoflowY: auto, autoflowX: hidden}}>
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
                {docNames.length === 0 ? (
                  <div>No documents attached to this order type.</div>
                ) : (
                  docNames.map((doc) => (
                    <Checkbox
                      key={doc}
                      label={doc}
                      checked={selectedDoc === doc}
                      onChange={() => setSelectedDoc(doc)}
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
      </div>
    </div>
    
  );
}


