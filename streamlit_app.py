import streamlit as st
from backend.ai_model import predict_disease, train_disease
from backend.satellite_data import get_ndvi

st.title("Satellite Crop Health Monitoring")

st.header("AI Disease Detection")
image_file = st.file_uploader("Upload crop image", type=["jpg", "png", "jpeg"])
if image_file:
    st.write("Image uploaded.")
    # Optionally ask for a label
    label = st.text_input("Enter disease label (optional)")
    if st.button("Train on this image"):
        result = train_disease(image_file, label if label else None)
        if result['status'] == 'success':
            st.success(result['message'])
        else:
            st.error(result['message'])

st.header("NDVI Analysis")
lat = st.number_input("Latitude", value=0.0)
lon = st.number_input("Longitude", value=0.0)
if st.button("Get NDVI"):
    st.write("NDVI analysis (Demo: NDVI logic goes here)")
    # ndvi = get_ndvi(lat, lon)
    # st.write(ndvi)

st.info("This is a basic Streamlit app template. Add more features as needed.")
