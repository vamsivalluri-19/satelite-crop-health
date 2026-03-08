import streamlit as st
from backend.ai_model import predict_disease
from backend.satellite_data import get_ndvi

st.title("Satellite Crop Health Monitoring")

st.header("AI Disease Detection")
image_file = st.file_uploader("Upload crop image", type=["jpg", "png", "jpeg"])
if image_file:
    # You would add image processing logic here
    st.write("Image uploaded. (Demo: AI prediction logic goes here)")
    # result = predict_disease(image_file)
    # st.write(result)

st.header("NDVI Analysis")
lat = st.number_input("Latitude", value=0.0)
lon = st.number_input("Longitude", value=0.0)
if st.button("Get NDVI"):
    st.write("NDVI analysis (Demo: NDVI logic goes here)")
    # ndvi = get_ndvi(lat, lon)
    # st.write(ndvi)

st.info("This is a basic Streamlit app template. Add more features as needed.")
